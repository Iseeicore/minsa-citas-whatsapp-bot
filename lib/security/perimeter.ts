import { logger } from "../observability/logger";
import { tail } from "../observability/mask";
import { deriveTraceId } from "../observability/tracer";
import { checkFirstMessagePayload } from "./payload-filter";
import type { RateLimiter } from "./rate-limiter";

// Entry gate of the WhatsApp webhook, run for every inbound message BEFORE any
// database write, transaction or turn lock. Cheapest first:
//
//   1. rate limit per waId (memory only)     -> drop silently
//   2. payload rules for a FIRST message      -> reply with a fixed text
//      (length, links, media without a session)
//
// Step 2 needs one indexed read ("is there a session?") and only when the
// payload actually looks bad — a normal message never pays for it.

export type PerimeterDecision =
  | { action: "drop"; reason: "throttled" | "banned" }
  | { action: "reject"; reason: "too_long" | "link" | "media"; reply: string }
  | { action: "continue" };

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
