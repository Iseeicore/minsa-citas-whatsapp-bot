import {
  INBOX_POLL_BACKOFF_FACTOR,
  INBOX_POLL_INTERVAL_MS,
  INBOX_POLL_MAX_DELAY_MS,
  INBOX_POLL_MAX_FAILURES,
} from "@/lib/constants/limits/inbox";

export function computePollDelay(consecutiveFailures: number): number {
  return Math.min(INBOX_POLL_INTERVAL_MS * INBOX_POLL_BACKOFF_FACTOR ** consecutiveFailures, INBOX_POLL_MAX_DELAY_MS);
}

export function shouldKeepPolling(consecutiveFailures: number): boolean {
  return consecutiveFailures < INBOX_POLL_MAX_FAILURES;
}
