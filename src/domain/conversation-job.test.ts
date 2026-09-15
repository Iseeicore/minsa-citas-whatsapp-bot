import { describe, expect, it } from "vitest";
import { isScheduledCheckJob } from "./conversation-job.js";
import type { ConversationJobData, ScheduledCheckJobData } from "./conversation-job.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";

function makeInboundJob(): InboundConversationEvent {
  return {
    eventId: "wamid.fixed-1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    source: "whatsapp",
    from: "51999999999",
    messageType: "text",
    text: "hola",
    raw: {},
  };
}

function makeScheduledJob(overrides: Partial<ScheduledCheckJobData> = {}): ScheduledCheckJobData {
  return {
    source: "schedule",
    sessionKey: "digest-1",
    to: "51999999999",
    kind: "cita_registration_wait_elapsed",
    waitToken: "registro_wait:1",
    expectedState: "cita_registration_wait",
    scheduledAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

describe("isScheduledCheckJob (D30 discriminated job payload)", () => {
  it("returns true for a scheduled-check job", () => {
    const job: ConversationJobData = makeScheduledJob();
    expect(isScheduledCheckJob(job)).toBe(true);
  });

  it("returns false for a real inbound (whatsapp-sourced) job — including legacy jobs with no jobKind field, per D30's zero-migration guarantee", () => {
    const job: ConversationJobData = makeInboundJob();
    expect(isScheduledCheckJob(job)).toBe(false);
  });
});
