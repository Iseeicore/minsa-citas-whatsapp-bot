import { describe, expect, it } from "vitest";
import { computePollDelay, shouldKeepPolling } from "@/lib/utils/poll-backoff";
import {
  INBOX_POLL_BACKOFF_FACTOR,
  INBOX_POLL_INTERVAL_MS,
  INBOX_POLL_MAX_DELAY_MS,
  INBOX_POLL_MAX_FAILURES,
} from "@/lib/constants/limits/inbox";

describe("computePollDelay", () => {
  it("polls at the normal pace while nothing fails", () => {
    expect(computePollDelay(0)).toBe(INBOX_POLL_INTERVAL_MS);
  });

  it("waits longer after each consecutive failure", () => {
    expect(computePollDelay(1)).toBe(INBOX_POLL_INTERVAL_MS * INBOX_POLL_BACKOFF_FACTOR);
    expect(computePollDelay(2)).toBe(INBOX_POLL_INTERVAL_MS * INBOX_POLL_BACKOFF_FACTOR ** 2);
    expect(computePollDelay(2)).toBeGreaterThan(computePollDelay(1));
  });

  it("never waits more than the cap", () => {
    expect(computePollDelay(50)).toBe(INBOX_POLL_MAX_DELAY_MS);
  });
});

describe("shouldKeepPolling", () => {
  it("keeps polling below the failure limit", () => {
    expect(shouldKeepPolling(0)).toBe(true);
    expect(shouldKeepPolling(INBOX_POLL_MAX_FAILURES - 1)).toBe(true);
  });

  it("stops after the limit of consecutive failures", () => {
    expect(shouldKeepPolling(INBOX_POLL_MAX_FAILURES)).toBe(false);
    expect(shouldKeepPolling(INBOX_POLL_MAX_FAILURES + 1)).toBe(false);
  });
});
