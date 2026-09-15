import { describe, expect, it } from "vitest";
import { toScheduledCheckJobLogView } from "./scheduled-check-job-log-view.js";
import type { ScheduledCheckJobData } from "./conversation-job.js";

function baseJob(overrides: Partial<ScheduledCheckJobData> = {}): ScheduledCheckJobData {
  return {
    source: "schedule",
    sessionKey: "a".repeat(64),
    to: "51999999999",
    kind: "cita_registration_wait_elapsed",
    waitToken: "registro_wait:1",
    expectedState: "cita_registration_wait",
    scheduledAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// D7/D17 carried forward to the scheduled path (Stage C1, PR5): the
// scheduled-job log line must never carry `to` (the citizen MSISDN) — the
// design's threat matrix states this explicitly, since toLogView's own
// whitelist discipline is the inbound arm's and does not apply here.
describe("toScheduledCheckJobLogView", () => {
  it("omits `to`, `scheduledAt`, and `source` entirely — not just as undefined-valued keys (threat: credential/secret in logs)", () => {
    const dto = toScheduledCheckJobLogView(baseJob());
    const keys = Object.keys(dto);

    expect(keys).not.toContain("to");
    expect(keys).not.toContain("scheduledAt");
    expect(keys).not.toContain("source");
  });

  it("never contains the citizen MSISDN anywhere in the serialized output", () => {
    const job = baseJob({ to: "51988888888" });
    const dto = toScheduledCheckJobLogView(job);

    expect(JSON.stringify(dto)).not.toContain(job.to);
  });

  it("passes through sessionKey, kind, waitToken, expectedState verbatim", () => {
    const job = baseJob();
    const dto = toScheduledCheckJobLogView(job);

    expect(dto.sessionKey).toBe(job.sessionKey);
    expect(dto.kind).toBe(job.kind);
    expect(dto.waitToken).toBe(job.waitToken);
    expect(dto.expectedState).toBe(job.expectedState);
  });
});
