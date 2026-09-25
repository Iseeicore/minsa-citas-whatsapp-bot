import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
// Per-waId sliding-window rate limiter for the WhatsApp webhook. Pure in-memory
// (no Redis in this stack): each serverless instance counts on its own, which is
// enough to stop a single client from hammering one instance and costs nothing.
//
//  - more than 5 messages in 10 s   -> the message is dropped (no database work)
//    and the number is MUTED for two minutes. The message that starts the mute is
//    reported as "muted" (the caller tells the citizen once, see perimeter.ts);
//    everything it sends meanwhile is "throttled": dropped in silence;
//  - more than 20 messages in 60 s  -> "banned" for one hour: everything from
//    that waId is dropped silently until the ban expires.
// Dropped messages still count toward the minute, so a flood always ends in a ban.
// The mute is what keeps a quick but legitimate typist from being answered in
// pieces; the ban is what stops someone who insists.

export type RateVerdict = "allow" | "throttled" | "muted" | "banned";

// How long a number stays silenced after a burst.
export const DEFAULT_MUTE_MS = 2 * 60 * 1000;

export type RateLimiterOptions = {
  now?: () => number;
  enabled?: boolean;
  burstLimit?: number;
  burstWindowMs?: number;
  banThreshold?: number;
  windowMs?: number;
  banMs?: number;
  // How long a number stays silenced after a burst. 0 = no mute (only the
  // messages over the burst limit are dropped).
  muteMs?: number;
  // Soft cap on tracked waIds; idle ones are swept when it is exceeded.
  maxKeys?: number;
  onBan?: (key: string) => void;
  onMute?: (key: string) => void;
};

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const now = options.now ?? Date.now;
  const enabled = options.enabled ?? true;
  const burstLimit = options.burstLimit ?? 5;
  const burstWindowMs = options.burstWindowMs ?? 10_000;
  const banThreshold = options.banThreshold ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const banMs = options.banMs ?? 60 * 60 * 1000;
  const muteMs = options.muteMs ?? DEFAULT_MUTE_MS;
  const maxKeys = options.maxKeys ?? 20_000;

  const hits = new Map<string, number[]>();
  const bans = new Map<string, number>();
  const mutes = new Map<string, number>();

  function sweep(current: number) {
    for (const [key, until] of bans) {
      if (until <= current) bans.delete(key);
    }
    for (const [key, until] of mutes) {
      if (until <= current) mutes.delete(key);
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
        mutes.delete(key);
        hits.delete(key); // the ban is over: clean slate
      }

      if (hits.size >= maxKeys) sweep(current);

      const recent = (hits.get(key) ?? []).filter((time) => time > current - windowMs);
      recent.push(current);
      hits.set(key, recent);

      if (recent.length > banThreshold) {
        bans.set(key, current + banMs);
        mutes.delete(key); // the ban supersedes the mute
        hits.delete(key);
        options.onBan?.(key);
        return "banned";
      }

      // Still muted: dropped, and it counted toward the minute above.
      const mutedUntil = mutes.get(key);
      if (mutedUntil !== undefined) {
        if (mutedUntil > current) return "throttled";
        mutes.delete(key);
      }

      const inBurst = recent.filter((time) => time > current - burstWindowMs).length;
      if (inBurst <= burstLimit) return "allow";

      if (muteMs > 0) {
        mutes.set(key, current + muteMs);
        options.onMute?.(key);
        return "muted"; // the one message of a mute the citizen is answered
      }
      return "throttled";
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
  onMute: (key) =>
    logger.warn("perimeter.muted", { waId: tail(key), duration: "2 minutes", limit: "more than 5 messages in 10 s" }),
});
