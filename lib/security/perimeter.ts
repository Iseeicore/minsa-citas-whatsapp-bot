import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { deriveTraceId } from "@/lib/observability/tracer";
import { checkFirstMessagePayload, type RejectReason } from "@/lib/security/payload-filter";
import { DEFAULT_MUTE_MS, type RateLimiter } from "@/lib/security/rate-limiter";

// Entry gate of the WhatsApp webhook, run for every inbound message BEFORE any
// database write, transaction or turn lock. Cheapest first:
//
//   1. rate limit per waId (memory only)     -> drop; the message that starts a
//                                               2-minute mute gets ONE fixed notice
//   2. payload rules for a FIRST message      -> reply with a fixed text
//      (length, links, media without a session)
//
// Step 2 needs one indexed read ("is there a session?") and only when the
// payload actually looks bad — a normal message never pays for it.

export type PerimeterDecision =
  | { action: "drop"; reason: "throttled" | "banned" }
  | { action: "reject"; reason: RejectReason | "muted"; reply: string }
  | { action: "continue" };

// Sent once per mute, to the message that starts it, and never again during it:
// a quick but legitimate typist learns why the bot went quiet and when to write
// again, and someone who insists is still met with silence and, in the end, a ban.
export const MUTE_NOTICE_TEXT = `Está enviando mensajes muy rápido. Por favor, espere ${DEFAULT_MUTE_MS / 60_000} minutos y vuelva a escribirnos.`;

export type PerimeterDeps = {
  limiter: RateLimiter;
  hasSession: (waId: string) => Promise<boolean>;
};

// The same traceId the turn would get, so a dropped or rejected message can be
// followed in the logs like any other.
const traceOf = (message: { waId: string; messageId?: string }) =>
  message.messageId ? deriveTraceId(message.waId, message.messageId) : undefined;

export async function screenInbound(
  message: { waId: string; type: string; text?: string; messageId?: string },
  deps: PerimeterDeps,
): Promise<PerimeterDecision> {
  const verdict = deps.limiter.check(message.waId);
  if (verdict === "banned") {
    logger.info("perimeter.dropped", { traceId: traceOf(message), waId: tail(message.waId), reason: "banned" });
    return { action: "drop", reason: "banned" };
  }
  if (verdict === "muted") {
    logger.info("perimeter.dropped", {
      traceId: traceOf(message),
      waId: tail(message.waId),
      reason: "throttled",
      limit: "more than 5 in 10 s",
      noticeSent: true,
    });
    return { action: "reject", reason: "muted", reply: MUTE_NOTICE_TEXT };
  }
  if (verdict === "throttled") {
    logger.info("perimeter.dropped", {
      traceId: traceOf(message),
      waId: tail(message.waId),
      reason: "throttled",
      limit: "more than 5 in 10 s",
    });
    return { action: "drop", reason: "throttled" };
  }

  const payload = checkFirstMessagePayload(message);
  if (payload.kind === "ok") return { action: "continue" };

  if (await deps.hasSession(message.waId)) return { action: "continue" };

  logger.info("perimeter.rejected", {
    traceId: traceOf(message),
    waId: tail(message.waId),
    reason: payload.reason,
    messageType: message.type,
    inputLength: message.text?.length,
  });
  return { action: "reject", reason: payload.reason, reply: payload.reply };
}
