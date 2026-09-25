import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";

export type RateVerdict = "allow" | "throttled" | "muted" | "banned";

export const DEFAULT_MUTE_MS = 2 * 60 * 1000;

export type RateLimiterOptions = {
  now?: () => number;
  enabled?: boolean;
  burstLimit?: number;
  burstWindowMs?: number;
  banThreshold?: number;
  windowMs?: number;
  banMs?: number;
  muteMs?: number;
  maxKeys?: number;
  onBan?: (key: string) => void;
  onMute?: (key: string) => void;
};

/** Contadores en memoria por instancia (no compartidos entre instancias): más de 20 mensajes en 60 s bloquean el número por 1 hora. */
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
        hits.delete(key);
      }

      if (hits.size >= maxKeys) sweep(current);

      const recent = (hits.get(key) ?? []).filter((time) => time > current - windowMs);
      recent.push(current);
      hits.set(key, recent);

      if (recent.length > banThreshold) {
        bans.set(key, current + banMs);
        mutes.delete(key);
        hits.delete(key);
        options.onBan?.(key);
        return "banned";
      }

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
        return "muted";
      }
      return "throttled";
    },

    size(): number {
      return hits.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export const inboundRateLimiter: RateLimiter = createRateLimiter({
  enabled: process.env.INBOUND_RATE_LIMIT !== "off",
  onBan: (key) =>
    logger.warn("perimeter.banned", { waId: tail(key), duration: "1 hour", limit: "more than 20 messages in 60 s" }),
  onMute: (key) =>
    logger.warn("perimeter.muted", { waId: tail(key), duration: "2 minutes", limit: "more than 5 messages in 10 s" }),
});
