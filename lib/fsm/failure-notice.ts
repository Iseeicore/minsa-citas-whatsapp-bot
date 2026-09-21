// Throttle for the citizen-facing text sent when a message could not be
// processed (TURN_FAILURE_TEXT, see app/webhook/whatsapp/route.ts's
// answerFailure). A burst that fails every message of the same number — an
// outage, a flapping dependency, a candado that keeps timing out — would
// otherwise send one "inconveniente temporal" text per failed message. This
// keeps it to one per number every 30 seconds; the failure itself is still
// LOGGED every time (turn.lock_timeout / webhook.message_failed), only the
// reply to the citizen is throttled.
//
// Same shape as lib/security/rate-limiter.ts (in memory, per key, injectable
// clock), deliberately kept separate: this throttles an OUTBOUND reply to a
// failure, not an inbound flood.

export type FailureNoticeThrottle = {
  // True the first time a number fails, and again once the window has passed
  // since the last notice; false while a notice already went out recently.
  shouldNotify(waId: string): boolean;
};

export function createFailureNoticeThrottle(
  options: { now?: () => number; windowMs?: number } = {},
): FailureNoticeThrottle {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 30_000;
  const lastNotifiedAt = new Map<string, number>();

  return {
    shouldNotify(waId: string): boolean {
      const current = now();
      const last = lastNotifiedAt.get(waId);
      if (last !== undefined && current - last < windowMs) return false;

      lastNotifiedAt.set(waId, current);
      return true;
    },
  };
}

// The instance the webhook uses.
export const failureNoticeThrottle: FailureNoticeThrottle = createFailureNoticeThrottle();
