import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { RateVerdict } from "@/lib/enums/rate-verdict";
import {
  EVIDENCE_IMAGE_BAN_MS,
  EVIDENCE_IMAGE_BAN_THRESHOLD,
  EVIDENCE_IMAGE_BAN_WINDOW_MS,
  EVIDENCE_IMAGE_BURST_LIMIT,
  EVIDENCE_IMAGE_BURST_WINDOW_MS,
} from "@/lib/constants/limits/perimeter";

export type { RateVerdict };

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
      if (!enabled) return RateVerdict.ALLOW;

      const current = now();

      const bannedUntil = bans.get(key);
      if (bannedUntil !== undefined) {
        if (bannedUntil > current) return RateVerdict.BANNED;
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
        return RateVerdict.BANNED;
      }

      const mutedUntil = mutes.get(key);
      if (mutedUntil !== undefined) {
        if (mutedUntil > current) return RateVerdict.THROTTLED;
        mutes.delete(key);
      }

      const inBurst = recent.filter((time) => time > current - burstWindowMs).length;
      if (inBurst <= burstLimit) return RateVerdict.ALLOW;

      if (muteMs > 0) {
        mutes.set(key, current + muteMs);
        options.onMute?.(key);
        return RateVerdict.MUTED;
      }
      return RateVerdict.THROTTLED;
    },

    peek(key: string): RateVerdict {
      if (!enabled) return RateVerdict.ALLOW;
      const current = now();
      if ((bans.get(key) ?? 0) > current) return RateVerdict.BANNED;
      if ((mutes.get(key) ?? 0) > current) return RateVerdict.THROTTLED;
      return RateVerdict.ALLOW;
    },

    ban(key: string): void {
      if (!enabled) return;
      bans.set(key, now() + banMs);
      mutes.delete(key);
      hits.delete(key);
    },

    size(): number {
      return hits.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export const inboundRateLimiter: RateLimiter = createRateLimiter({
  enabled: process.env.INBOUND_RATE_LIMIT !== "off",
  onBan: (key) => logger.warn("perimeter.banned", { waId: tail(key), duration: "1 hour", limit: "more than 20 messages in 60 s" }),
  onMute: (key) => logger.warn("perimeter.muted", { waId: tail(key), duration: "2 minutes", limit: "more than 5 messages in 10 s" }),
});

export function createEvidenceImageRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  return createRateLimiter({
    burstLimit: EVIDENCE_IMAGE_BURST_LIMIT,
    burstWindowMs: EVIDENCE_IMAGE_BURST_WINDOW_MS,
    banThreshold: EVIDENCE_IMAGE_BAN_THRESHOLD,
    windowMs: EVIDENCE_IMAGE_BAN_WINDOW_MS,
    banMs: EVIDENCE_IMAGE_BAN_MS,
    muteMs: 0,
    ...options,
  });
}

export const evidenceImageRateLimiter: RateLimiter = createEvidenceImageRateLimiter({
  enabled: process.env.INBOUND_RATE_LIMIT !== "off",
  onBan: (key) =>
    logger.warn("perimeter.banned", {
      waId: tail(key),
      duration: "1 hour",
      limit: `more than ${EVIDENCE_IMAGE_BAN_THRESHOLD} evidence images in ${EVIDENCE_IMAGE_BAN_WINDOW_MS / 1000} s`,
    }),
});
