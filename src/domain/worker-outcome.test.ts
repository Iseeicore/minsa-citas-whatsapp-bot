import { describe, expect, it } from "vitest";
import { classifyWorkerOutcome } from "./worker-outcome.js";
import {
  BusinessRejectionError,
  MediaTooLargeError,
  QuejasSubmissionClientNotConfiguredError,
  ScheduledCheckSchedulerNotConfiguredError,
  TransientFailureError,
} from "./errors.js";

// D14: unknown/unclassified errors default to transient — the producer
// already caps attempts:3 with exponential backoff, so an unknown failure
// dead-letters instead of looping forever, rather than being misfiled as a
// business stop that silently never retries.
describe("classifyWorkerOutcome", () => {
  it("classifies a TransientFailureError as transient", () => {
    expect(classifyWorkerOutcome(new TransientFailureError("redis unreachable"))).toBe("transient");
  });

  it("classifies a BusinessRejectionError as business", () => {
    expect(classifyWorkerOutcome(new BusinessRejectionError("citizen rejected the flow"))).toBe("business");
  });

  it("classifies a QuejasSubmissionClientNotConfiguredError as business (PR5 — deterministic wiring gap, never retriable)", () => {
    expect(classifyWorkerOutcome(new QuejasSubmissionClientNotConfiguredError("not wired yet"))).toBe("business");
  });

  it("classifies a MediaTooLargeError as business (Phase 7 — retrying will not shrink the file)", () => {
    expect(classifyWorkerOutcome(new MediaTooLargeError("file too big"))).toBe("business");
  });

  it("classifies a ScheduledCheckSchedulerNotConfiguredError as business (PR4 — deterministic wiring gap, never retriable)", () => {
    expect(classifyWorkerOutcome(new ScheduledCheckSchedulerNotConfiguredError("not wired yet"))).toBe("business");
  });

  it("classifies a plain, unclassified Error as transient (safe default)", () => {
    expect(classifyWorkerOutcome(new Error("something unexpected"))).toBe("transient");
  });

  it("classifies a non-Error thrown value as transient (safe default)", () => {
    expect(classifyWorkerOutcome("a string was thrown")).toBe("transient");
  });
});
