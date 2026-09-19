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

const tail = (waId: string) => `...${waId.slice(-4)}`;

export async function screenInbound(
  message: { waId: string; type: string; text?: string },
  deps: PerimeterDeps,
): Promise<PerimeterDecision> {
  const verdict = deps.limiter.check(message.waId);
  if (verdict === "banned") return { action: "drop", reason: "banned" };
  if (verdict === "throttled") {
    console.info(`[perimeter] dropped a message from ${tail(message.waId)}: more than 5 in 10 s`);
    return { action: "drop", reason: "throttled" };
  }

  const payload = checkFirstMessagePayload(message);
  if (payload.kind === "ok") return { action: "continue" };

  if (await deps.hasSession(message.waId)) return { action: "continue" };

  console.info(`[perimeter] rejected a first message from ${tail(message.waId)}: ${payload.reason}`);
  return { action: "reject", reason: payload.reason, reply: payload.reply };
}
