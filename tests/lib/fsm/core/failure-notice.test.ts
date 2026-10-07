import { describe, expect, it } from "vitest";
import { createFailureNoticeThrottle } from "@/lib/fsm/core/failure-notice";

function throttleWithClock(options: Parameters<typeof createFailureNoticeThrottle>[0] = {}) {
  let now = 1_000_000;
  const throttle = createFailureNoticeThrottle({ now: () => now, ...options });
  return { throttle, advance: (ms: number) => { now += ms; } };
}

describe("createFailureNoticeThrottle: one friendly text per number, per window", () => {
  it("the first failure of a number is always notified", () => {
    const { throttle } = throttleWithClock();

    expect(throttle.shouldNotify("wa-1")).toBe(true);
  });

  it("a second failure right after the first, of the same number, is not notified again", () => {
    const { throttle } = throttleWithClock();
    throttle.shouldNotify("wa-1");

    expect(throttle.shouldNotify("wa-1")).toBe(false);
    expect(throttle.shouldNotify("wa-1")).toBe(false);
  });

  it("defaults to 30 seconds, then notifies again", () => {
    const { throttle, advance } = throttleWithClock();
    throttle.shouldNotify("wa-1");

    advance(29_999);
    expect(throttle.shouldNotify("wa-1")).toBe(false);

    advance(1);
    expect(throttle.shouldNotify("wa-1")).toBe(true);
  });

  it("the window is configurable", () => {
    const { throttle, advance } = throttleWithClock({ windowMs: 5_000 });
    throttle.shouldNotify("wa-1");

    advance(4_999);
    expect(throttle.shouldNotify("wa-1")).toBe(false);

    advance(1);
    expect(throttle.shouldNotify("wa-1")).toBe(true);
  });

  it("is per number: another waId is never held back by someone else's failures", () => {
    const { throttle } = throttleWithClock();
    throttle.shouldNotify("wa-1");

    expect(throttle.shouldNotify("wa-2")).toBe(true);
  });

  it("a notified failure resets the window from the moment it was sent, not from the first one", () => {
    const { throttle, advance } = throttleWithClock();
    throttle.shouldNotify("wa-1");

    advance(30_000);
    expect(throttle.shouldNotify("wa-1")).toBe(true);

    advance(29_999);
    expect(throttle.shouldNotify("wa-1")).toBe(false);
  });
});
