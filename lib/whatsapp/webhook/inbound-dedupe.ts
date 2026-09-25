export const INBOUND_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const SWEEP_INTERVAL_MS = 60_000;

/** Sin base de datos, recuerda por 24 h los ids ya atendidos para no responder dos veces a una reentrega de Meta. */
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
