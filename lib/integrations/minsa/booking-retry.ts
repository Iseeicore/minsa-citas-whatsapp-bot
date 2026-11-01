import { logger } from "@/lib/observability/logger";
import { BOOKING_RETRY_MAX_DELAY_MS, BOOKING_RETRY_MIN_DELAY_MS } from "@/lib/constants/limits/minsa";

export type RetryClock = {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

const SYSTEM_CLOCK: RetryClock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

function bookingRetryDelayMs(random: () => number): number {
  return BOOKING_RETRY_MIN_DELAY_MS + Math.floor(random() * (BOOKING_RETRY_MAX_DELAY_MS - BOOKING_RETRY_MIN_DELAY_MS + 1));
}

export async function waitBeforeBookingRetry(attempt: number, clock: RetryClock = SYSTEM_CLOCK): Promise<void> {
  const delayMs = bookingRetryDelayMs(clock.random);
  logger.info("booking.retry_wait", { attempt, delayMs });
  await clock.sleep(delayMs);
}
