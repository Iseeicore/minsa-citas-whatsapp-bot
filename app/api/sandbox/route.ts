import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn, runTurnUnlocked, type TurnHooks, type TurnResult } from "@/lib/fsm/core/executor";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { logger } from "@/lib/observability/logger";
import { traceTurn } from "@/lib/observability/tracer";
import { createLatencyMarks, type LatencyMarks } from "@/lib/observability/inbound-latency";
import { withTurnLock } from "@/lib/fsm/session/turn-lock";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { closeSession, resetAllSandboxTestSessions, resetSession, saveSession, sessionRowExists } from "@/lib/fsm/session/session-store";
import type { InteractiveTracking, SendEffect } from "@/lib/fsm/core/types";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";
import { apiError } from "@/lib/http/api-error";
import { buildSandboxReply } from "@/lib/utils/sandbox-reply";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { SendType } from "@/lib/enums/send-type";
import { SessionChannel } from "@/lib/enums/session-channel";
import { SessionState } from "@/lib/enums/session-state";
import { trackSent, withInteractiveTracking } from "@/lib/fsm/core/interactive-reply";
import { randomUuid } from "@/lib/utils/random-uuid";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { verifySandboxSignature } from "@/lib/security/sandbox-signature";
import { SANDBOX_SIGNATURE_HEADER, SANDBOX_TIMESTAMP_HEADER } from "@/lib/constants/sandbox-signature";
import { SANDBOX_DISABLED_TEXT, SANDBOX_UNSIGNED_TEXT } from "@/lib/constants/textos/sandbox";
import { SandboxSignatureResult } from "@/lib/enums/sandbox-signature-result";

const SANDBOX_TURN_HOOKS: TurnHooks = {
  onSend: async () => randomUuid(),
  onWaitingForQuery: async () => undefined,
};

const warnedInvalidOrigins = new Set<string>();

function allowedOrigins(): string[] {
  const { origins, invalid } = parseAllowedOrigins(process.env.SANDBOX_ALLOWED_ORIGINS);
  for (const entry of invalid) {
    if (warnedInvalidOrigins.has(entry)) continue;
    warnedInvalidOrigins.add(entry);
    logger.warn("sandbox.cors_invalid_origin", { entry });
  }
  return origins;
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_ENABLED === "true";
}

function rejectedSignature(request: NextRequest, rawBody: string): SandboxSignatureResult | undefined {
  const secret = process.env.SANDBOX_SHARED_SECRET;
  if (!secret) return undefined;

  const result = verifySandboxSignature({
    secret,
    timestamp: request.headers.get(SANDBOX_TIMESTAMP_HEADER),
    signature: request.headers.get(SANDBOX_SIGNATURE_HEADER),
    body: rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  return result === SandboxSignatureResult.VALID ? undefined : result;
}

export async function OPTIONS(request: NextRequest) {
  if (!isSandboxEnabled()) return apiError(ApiErrorCode.NOT_FOUND, { message: SANDBOX_DISABLED_TEXT });

  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
    },
  });
}

const sandboxEventSchema = z.object({
  from: z.string().min(1),
  type: z.enum(["text", "button", "list", "image", "document"]),
  text: z.string().optional(),
  listId: z.string().optional(),
  replyTo: z.string().optional(),
  mediaId: z.string().optional(),
  mediaDataUri: z.string().optional(),
  reset: z.boolean().optional(),
  resetAll: z.boolean().optional(),
  close: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request);

  if (!isSandboxEnabled()) {
    return apiError(ApiErrorCode.NOT_FOUND, { message: SANDBOX_DISABLED_TEXT, headers: cors });
  }

  const rawBody = await request.text();
  const rejection = rejectedSignature(request, rawBody);
  if (rejection) {
    logger.warn("sandbox.signature_rejected", { reason: rejection });
    return apiError(ApiErrorCode.UNAUTHORIZED, { message: SANDBOX_UNSIGNED_TEXT, headers: cors });
  }

  const body = rawBody ? parseJsonOr(rawBody, undefined) : undefined;
  if (body === undefined) return apiError(ApiErrorCode.INVALID_BODY, { headers: cors });
  const parsed = sandboxEventSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(ApiErrorCode.INVALID_BODY, { detail: parsed.error.message, headers: cors });
  }

  const { from, type, text, listId, replyTo, mediaId, mediaDataUri, reset, resetAll, close } = parsed.data;

  if (close) {
    await closeSession(from);
    return NextResponse.json({ closed: true }, { headers: cors });
  }

  const marks = createLatencyMarks();

  if (resetAll) {
    await resetAllSandboxTestSessions();
  } else if (reset) {
    await resetSession(from);
  }
  marks.mark("reset");

  const hadExistingSession = reset || resetAll ? false : await sessionRowExists(from);
  marks.mark("exists");

  if (!hadExistingSession && (type === "text" || type === "image")) {
    const payload = checkFirstMessagePayload({ type: type === "image" ? "image" : "text", text });
    if (payload.kind === "rejected") {
      return NextResponse.json(
        buildSandboxReply([{ kind: SendType.TEXT, text: payload.reply }], { state: SessionState.MAIN_MENU, slots: {}, counters: {} }),
        { headers: cors },
      );
    }
  }

  const abusiveFirstMessage =
    type === "text" && !!text && !isEmergency(textoDeLaPersona(text)) && evaluateLexicalGuard(textoDeLaPersona(text)).action !== "ALLOW";

  let turn;
  try {
    turn =
      !hadExistingSession && !abusiveFirstMessage
        ? await startConversation(from, type === "text" ? text : undefined, marks)
        : await runTurn(from, { from, type, text, listId, replyTo, mediaId, mediaDataUri, channel: "web" }, SANDBOX_TURN_HOOKS);
  } catch (error) {
    if (error instanceof TurnLockTimeoutError) {
      return apiError(ApiErrorCode.BUSY, { headers: cors });
    }
    throw error;
  }
  marks.mark("turn");
  marks.finish("sandbox.latency", { waId: from, channel: "web" });
  const { sent, session } = turn;

  return NextResponse.json(buildSandboxReply(sent, session), { headers: cors });
}

async function startConversation(from: string, text: string | undefined, marks: LatencyMarks): Promise<TurnResult> {
  return withTurnLock(from, async () => {
    marks.mark("lock");
    const fresh = { state: SessionState.MAIN_MENU, slots: {}, counters: {}, channel: "web" as const };
    const first = handleFirstContact(text, "web");
    if (first.effects.some(isQueryEffect)) {
      return runTurnUnlocked(from, { from, type: "text", text, channel: SessionChannel.WEB }, SANDBOX_TURN_HOOKS, first);
    }

    return traceTurn(from, { type: text === undefined ? "other" : "text", text }, fresh, async (trace) => {
      for (const note of first.notes ?? []) trace.note(note);

      const sent = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      const tracking = sent.reduce<InteractiveTracking>((current, effect) => trackSent(current, effect, randomUuid()), { consumed: false });
      const session = withInteractiveTracking(first.session, tracking);
      await saveSession(from, session);
      trace.complete({ session, sentCount: sent.length });
      return { sent, session };
    });
  });
}
