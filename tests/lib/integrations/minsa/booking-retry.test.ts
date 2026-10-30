import { afterEach, describe, expect, it, vi } from "vitest";
import { waitBeforeBookingRetry } from "@/lib/integrations/minsa/booking-retry";
import { logger } from "@/lib/observability/logger";

describe("waitBeforeBookingRetry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("waits a jittered 1 to 3 seconds through the injected clock and logs the wait", async () => {
    const info = vi.spyOn(logger, "info");
    const sleep = vi.fn(async () => undefined);

    await waitBeforeBookingRetry(2, { sleep, random: () => 0.5 });
    await waitBeforeBookingRetry(1, { sleep, random: () => 0 });
    await waitBeforeBookingRetry(3, { sleep, random: () => 0.9999 });

    expect(sleep.mock.calls).toEqual([[2000], [1000], [3000]]);
    expect(info).toHaveBeenCalledWith("booking.retry_wait", { attempt: 2, delayMs: 2000 });
  });
});
