import { logger } from "../observability/logger";
import { tail } from "../observability/mask";
// Per-waId sliding-window rate limiter for the WhatsApp webhook. Pure in-memory
// (no Redis in this stack): each serverless instance counts on its own, which is
// enough to stop a single client from hammering one instance and costs nothing.
//
//  - more than 5 messages in 10 s   -> "throttled": the message is dropped
//    silently (no reply, no database work);
//  - more than 20 messages in 60 s  -> "banned" for one hour: everything from
//    that waId is dropped silently until the ban expires.
// Dropped messages still count toward the minute, so a flood always ends in a ban.

export type RateVerdict = "allow" | "throttled" | "banned";

export type RateLimiterOptions = {
  now?: () => number;
  enabled?: boolean;
  burstLimit?: number;
  burstWindowMs?: number;
  banThreshold?: number;
  windowMs?: number;
  banMs?: number;
  // Soft cap on tracked waIds; idle ones are swept when it is exceeded.
  maxKeys?: number;
  onBan?: (key: string) => void;
};

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const now = options.now ?? Date.now;
  const enabled = options.enabled ?? true;
  const burstLimit = options.burstLimit ?? 5;
  const burstWindowMs = options.burstWindowMs ?? 10_000;
  const banThreshold = options.banThreshold ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const banMs = options.banMs ?? 60 * 60 * 1000;
  const maxKeys = options.maxKeys ?? 20_000;

  const hits = new Map<string, number[]>();
  const bans = new Map<string, number>();

  function sweep(current: number) {
    for (const [key, until] of bans) {
      if (until <= current) bans.delete(key);
    }
    for (const [key, times] of hits) {
      if (times.length === 0 || times[times.length - 1] <= current - windowMs) hits.delete(key);
    }
  }

  return {
    check(key: string): RateVerdict {
      if (!enabled) return "allow";

      const current = now();

      const bannedUntil = bans.get(key);
      if (bannedUntil !== undefined) {
        if (bannedUntil > current) return "banned";
        bans.delete(key);
        hits.delete(key); // the ban is over: clean slate
      }

      if (hits.size >= maxKeys) sweep(current);

      const recent = (hits.get(key) ?? []).filter((time) => time > current - windowMs);
      recent.push(current);
      hits.set(key, recent);

      if (recent.length > banThreshold) {
        bans.set(key, current + banMs);
        hits.delete(key);
        options.onBan?.(key);
        return "banned";
      }

      const inBurst = recent.filter((time) => time > current - burstWindowMs).length;
      return inBurst > burstLimit ? "throttled" : "allow";
    },

    size(): number {
      return hits.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

// The limiter the webhook uses. INBOUND_RATE_LIMIT=off disables it (local
// debugging); it is per server instance by design.
export const inboundRateLimiter: RateLimiter = createRateLimiter({
  enabled: process.env.INBOUND_RATE_LIMIT !== "off",
  onBan: (key) =>
    logger.warn("perimeter.banned", { waId: tail(key), duration: "1 hour", limit: "more than 20 messages in 60 s" }),
});
