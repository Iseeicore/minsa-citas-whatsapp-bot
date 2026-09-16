import type { ScheduledCheckJobData } from "./conversation-job.js";

// D7/D17 carried forward (Stage C1, PR5): the sanitized log-view DTO for a
// fired scheduled-check job — mirrors inbound-conversation-event-log-view.ts's
// role for the inbound arm. `to` (the citizen MSISDN) is deliberately NOT a
// field here — not omitted-when-undefined, genuinely absent from the shape.
// `toLogView` is the inbound arm's own whitelist and does not apply to a
// timer fire (design's threat matrix, "Credential / secret at rest and in
// logs" row). Nothing here ever carries minsaIntegrationSecret, the HMAC
// signature, citaBearer, or the OTP code either — this DTO only ever
// touches job-routing metadata.
export interface ScheduledCheckJobLogView {
  readonly sessionKey: string;
  readonly kind: string;
  readonly waitToken: string;
  readonly expectedState: string;
}

export function toScheduledCheckJobLogView(data: ScheduledCheckJobData): ScheduledCheckJobLogView {
  return {
    sessionKey: data.sessionKey,
    kind: data.kind,
    waitToken: data.waitToken,
    expectedState: data.expectedState,
  };
}
