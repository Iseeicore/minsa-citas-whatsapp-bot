import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn, runTurnUnlocked, type TurnResult } from "@/lib/fsm/core/executor";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { logger } from "@/lib/observability/logger";
import { traceTurn } from "@/lib/observability/tracer";
import { TurnLockTimeoutError, withTurnLock } from "@/lib/fsm/session/turn-lock";
import { resetAllSandboxTestSessions, resetSession, saveSession, sessionRowExists } from "@/lib/fsm/session/session-store";
import type { SendEffect } from "@/lib/fsm/core/types";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";

const warnedInvalidOrigins = new Set<string>();

/** Reduce cada entrada a su origen: la cabecera Origin del navegador nunca trae ruta ni barra final. */
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

export async function OPTIONS(request: NextRequest) {
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
  type: z.enum(["text", "button", "list", "image"]),
  text: z.string().optional(),
  listId: z.string().optional(),
  mediaId: z.string().optional(),
  mediaDataUri: z.string().optional(),
  reset: z.boolean().optional(),
  resetAll: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request);

  if (process.env.SANDBOX_ENABLED !== "true") {
    return apiError(ApiErrorCode.NOT_FOUND, { message: "El Sandbox no está habilitado en este despliegue.", headers: cors });
  }

  const body = await request.json().catch(() => undefined);
  if (body === undefined) return apiError(ApiErrorCode.INVALID_BODY, { headers: cors });
  const parsed = sandboxEventSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(ApiErrorCode.INVALID_BODY, { detail: parsed.error.message, headers: cors });
  }

  const { from, type, text, listId, mediaId, mediaDataUri, reset, resetAll } = parsed.data;

  if (resetAll) {
    await resetAllSandboxTestSessions();
  } else if (reset) {
    await resetSession(from);
  }

  const hadExistingSession = await sessionRowExists(from);

  if (!hadExistingSession && (type === "text" || type === "image")) {
    const payload = checkFirstMessagePayload({ type: type === "image" ? "image" : "text", text });
    if (payload.kind === "rejected") {
      return NextResponse.json(
        {
          sent: [{ kind: SendType.TEXT, text: payload.reply }],
          session: { state: SessionState.MAIN_MENU, slots: {}, counters: {} },
        },
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
        ? await startConversation(from, type === "text" ? text : undefined)
        : await runTurn(from, { from, type, text, listId, mediaId, mediaDataUri });
  } catch (error) {
    if (error instanceof TurnLockTimeoutError) {
      return apiError(ApiErrorCode.BUSY, { headers: cors });
    }
    throw error;
  }
  const { sent, session } = turn;

  return NextResponse.json(
    {
      sent,
      session: { state: session.state, slots: session.slots, counters: session.counters },
    },
    { headers: cors },
  );
}

async function startConversation(from: string, text?: string): Promise<TurnResult> {
  return withTurnLock(from, async () => {
    const fresh = { state: SessionState.MAIN_MENU, slots: {}, counters: {}, channel: "web" as const };
    const first = handleFirstContact(text, "web");
    if (first.effects.some(isQueryEffect)) return runTurnUnlocked(from, { from, type: "text", text }, undefined, first);

    return traceTurn(from, { type: text === undefined ? "other" : "text", text }, fresh, async (trace) => {
      for (const note of first.notes ?? []) trace.note(note);
      await saveSession(from, first.session);

      const sent = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      trace.complete({ session: first.session, sentCount: sent.length });
      return { sent, session: first.session };
    });
  });
}
