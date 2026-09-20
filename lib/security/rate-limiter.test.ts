import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter";

function limiterWithClock(options: Parameters<typeof createRateLimiter>[0] = {}) {
  let now = 1_000_000;
  const limiter = createRateLimiter({ now: () => now, ...options });
  return {
    limiter,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("burst limit: more than 5 messages in 10 seconds are dropped", () => {
  it("allows exactly 5 in 10 s and drops the 6th", () => {
    const { limiter, advance } = limiterWithClock();

    const verdicts = Array.from({ length: 6 }, () => {
      advance(1000);
      return limiter.check("wa-1");
    });

    expect(verdicts).toEqual(["allow", "allow", "allow", "allow", "allow", "muted"]);
  });

  it("the window slides: once the old messages age out, messages are allowed again", () => {
    const { limiter, advance } = limiterWithClock({ muteMs: 0 }); // the mute has its own tests below
    for (let i = 0; i < 6; i++) limiter.check("wa-1"); // 6th throttled, all at t=0

    advance(10_001);

    expect(limiter.check("wa-1")).toBe("allow");
  });

  it("it is a SLIDING window, not fixed buckets", () => {
    const messagesAt = (probeAfterMs: number) => {
      const { limiter, advance } = limiterWithClock();
      for (let i = 0; i < 5; i++) {
        limiter.check("wa-1");
        advance(1900); // messages at t = 0, 1.9, 3.8, 5.7, 7.6 s; the clock now reads 9.5 s
      }
      advance(probeAfterMs - 9500);
      return limiter.check("wa-1");
    };

    expect(messagesAt(9500)).toBe("muted"); // still 5 messages inside the last 10 s (the 6th starts the mute)
    expect(messagesAt(10_200)).toBe("allow"); // the one from t=0 has aged out
  });

  it("a slow, normal conversation is never limited", () => {
    const { limiter, advance } = limiterWithClock();
    for (let i = 0; i < 50; i++) {
      expect(limiter.check("wa-1")).toBe("allow");
      advance(4000);
    }
  });

  it("each waId has its own window", () => {
    const { limiter } = limiterWithClock();
    for (let i = 0; i < 8; i++) limiter.check("noisy");

    expect(limiter.check("noisy")).toBe("throttled");
    expect(limiter.check("quiet")).toBe("allow");
  });
});

describe("mute: a burst silences the number for two minutes", () => {
  const burst = (limiter: ReturnType<typeof createRateLimiter>, count = 6) => Array.from({ length: count }, () => limiter.check("wa-1"));

  it("the 6th message in 10 s starts the mute: the burst window alone would have let the next one through at 10 s", () => {
    const { limiter, advance } = limiterWithClock();

    expect(burst(limiter)).toEqual(["allow", "allow", "allow", "allow", "allow", "muted"]);

    advance(10_001); // without the mute this would be allowed again
    expect(limiter.check("wa-1")).toBe("throttled");
  });

  it("lasts two minutes, then the citizen is heard again", () => {
    const { limiter, advance } = limiterWithClock();
    burst(limiter);

    advance(119_000);
    expect(limiter.check("wa-1")).toBe("throttled");

    advance(2_000); // 121 s after the burst
    expect(limiter.check("wa-1")).toBe("allow");
    expect(limiter.check("wa-1")).toBe("allow");
  });

  it("only five quick messages are never muted", () => {
    const { limiter, advance } = limiterWithClock();

    expect(burst(limiter, 5).every((verdict) => verdict === "allow")).toBe(true);
    advance(11_000);
    expect(limiter.check("wa-1")).toBe("allow");
  });

  it("is per number", () => {
    const { limiter } = limiterWithClock();
    burst(limiter);

    expect(limiter.check("someone-else")).toBe("allow");
  });

  it("messages sent while muted still count toward the minute, so insisting ends in the one-hour ban", () => {
    const { limiter, advance } = limiterWithClock();
    burst(limiter); // 6 messages, the last one starts the mute

    const during: string[] = [];
    for (let i = 0; i < 20; i++) {
      advance(2_000);
      during.push(limiter.check("wa-1"));
    }

    expect(during.includes("banned")).toBe(true); // the 21st message inside 60 s
    advance(30 * 60 * 1000);
    expect(limiter.check("wa-1")).toBe("banned");
  });

  it("is reported once per mute through onMute, not once per dropped message", () => {
    const muted: string[] = [];
    const { limiter, advance } = limiterWithClock({ onMute: (key) => muted.push(key) });

    burst(limiter, 12);
    expect(muted).toEqual(["wa-1"]);

    advance(121_000);
    burst(limiter);
    expect(muted).toEqual(["wa-1", "wa-1"]);
  });

  it("only the message that STARTS the mute is reported as «muted»: the rest of it is «throttled»", () => {
    const { limiter } = limiterWithClock();

    expect(burst(limiter, 10)).toEqual([
      "allow", "allow", "allow", "allow", "allow", "muted", "throttled", "throttled", "throttled", "throttled",
    ]);
  });

  it("every new mute starts with its own «muted», so the citizen is told once per mute", () => {
    const { limiter, advance } = limiterWithClock();

    expect(burst(limiter)[5]).toBe("muted");
    advance(121_000);
    expect(burst(limiter)[5]).toBe("muted");
  });

  it("a ban is never reported as «muted»", () => {
    const { limiter } = limiterWithClock();
    const verdicts = Array.from({ length: 25 }, () => limiter.check("wa-1"));

    expect(verdicts.filter((verdict) => verdict === "muted")).toHaveLength(1);
    expect(verdicts[24]).toBe("banned");
  });

  it("muteMs: 0 keeps the previous behavior (only the messages over the limit are dropped, nothing to announce)", () => {
    const { limiter, advance } = limiterWithClock({ muteMs: 0 });
    expect(burst(limiter)[5]).toBe("throttled");

    advance(10_001);

    expect(limiter.check("wa-1")).toBe("allow");
  });

  it("is off with the rest of the limiter", () => {
    const { limiter } = limiterWithClock({ enabled: false });

    expect(burst(limiter, 30).every((verdict) => verdict === "allow")).toBe(true);
  });
});

describe("ban: more than 20 messages in a minute earns a one-hour ban", () => {
  // 7 s apart never trips the burst rule (2 per 10 s) but trips the minute rule.
  function sendSteadily(limiter: ReturnType<typeof createRateLimiter>, advance: (ms: number) => void, count: number) {
    const verdicts: string[] = [];
    for (let i = 0; i < count; i++) {
      verdicts.push(limiter.check("wa-1"));
      advance(2900);
    }
    return verdicts;
  }

  it("bans on the 21st message inside 60 s", () => {
    const { limiter, advance } = limiterWithClock();

    // 2.9 s apart: 21 messages span 58 s (and only 4 per 10 s, so no burst drops)
    const verdicts = sendSteadily(limiter, advance, 21);

    expect(verdicts.slice(0, 20).every((verdict) => verdict === "allow")).toBe(true);
    expect(verdicts[20]).toBe("banned");
  });

  it("stays banned for a full hour, even for a single polite message", () => {
    const { limiter, advance } = limiterWithClock();
    sendSteadily(limiter, advance, 21);

    advance(59 * 60 * 1000);
    expect(limiter.check("wa-1")).toBe("banned");
    expect(limiter.check("wa-1")).toBe("banned");
  });

  it("is lifted after one hour and the citizen starts with a clean slate", () => {
    const { limiter, advance } = limiterWithClock();
    sendSteadily(limiter, advance, 21);

    advance(60 * 60 * 1000 + 1);

    expect(limiter.check("wa-1")).toBe("allow");
    expect(limiter.check("wa-1")).toBe("allow");
  });

  it("does not affect other waIds", () => {
    const { limiter, advance } = limiterWithClock();
    sendSteadily(limiter, advance, 21);

    expect(limiter.check("someone-else")).toBe("allow");
  });

  it("throttled messages still count toward the minute, so a flood ends in a ban", () => {
    const { limiter } = limiterWithClock();

    const verdicts = Array.from({ length: 25 }, () => limiter.check("wa-1")); // all at the same instant

    expect(verdicts.slice(0, 5)).toEqual(Array(5).fill("allow"));
    expect(verdicts[5]).toBe("muted");
    expect(verdicts.slice(6, 20).every((verdict) => verdict === "throttled")).toBe(true);
    expect(verdicts[20]).toBe("banned");
    expect(verdicts[24]).toBe("banned");
  });

  it("reports each ban once through onBan", () => {
    const banned: string[] = [];
    const { limiter } = limiterWithClock({ onBan: (key) => banned.push(key) });

    for (let i = 0; i < 40; i++) limiter.check("wa-1");

    expect(banned).toEqual(["wa-1"]);
  });
});

describe("memory", () => {
  it("forgets idle waIds instead of growing forever", () => {
    const { limiter, advance } = limiterWithClock({ maxKeys: 100 });

    for (let i = 0; i < 500; i++) {
      limiter.check(`wa-${i}`);
      advance(1000);
    }

    expect(limiter.size()).toBeLessThanOrEqual(100 + 61); // at most the ones still inside a 60 s window plus the cap
  });

  it("can be switched off", () => {
    const { limiter } = limiterWithClock({ enabled: false });
    for (let i = 0; i < 100; i++) expect(limiter.check("wa-1")).toBe("allow");
  });
});
