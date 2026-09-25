// With DATABASE_ENABLED=false there is no unique waMessageId index to decide who
// owns a message, so this process remembers the ids it already answered.
//
// One day: the webhook acknowledges Meta immediately (see route.ts), so a
// redelivery only happens around a failed delivery and arrives within that
// outage window, well inside a day. Meta keeps retrying a failing endpoint for
// longer (see route.ts), but a redelivery past a day — or after a restart,
// which empties this set — is answered again; that is the price of keeping
// nothing on disk. Memory stays bounded by the messages of the last day.
export const INBOUND_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const SWEEP_INTERVAL_MS = 60_000;

export function createInboundDedupe(options: { now?: () => number; ttlMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? INBOUND_DEDUPE_TTL_MS;
  const claimedAt = new Map<string, number>();
  let lastSweep = now();

  function evictExpired(): void {
    if (now() - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now();
    for (const [id, at] of claimedAt) {
      if (now() - at >= ttlMs) claimedAt.delete(id);
    }
  }

  return {
    // True for the first delivery of a message id (answer it); false for a
    // redelivery still within the TTL (skip it).
    claim(messageId: string): boolean {
      evictExpired();
      const at = claimedAt.get(messageId);
      if (at !== undefined && now() - at < ttlMs) return false;
      claimedAt.set(messageId, now());
      return true;
    },
  };
}

export const inboundDedupe = createInboundDedupe();
