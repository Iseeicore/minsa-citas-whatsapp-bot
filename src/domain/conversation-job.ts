import type { InboundConversationEvent } from "./inbound-conversation-event.js";

// D30 (Stage C1, PR4): the discriminated worker job payload. `job.data`
// becomes a union of the existing inbound-event arm and a new scheduled-check
// arm, delivered on the SAME BullMQ queue and connection (single
// `CONVERSATION_QUEUE_NAME`, conversation-queue.ts) — no second Queue/Worker
// pair, one shutdown handler. Discriminated on the existing `source` field
// (not a new `jobKind`), so in-flight legacy jobs already carrying
// `source: "whatsapp"` route to the inbound arm unchanged — zero job
// migration on deploy.
//
// This file is a pure data-shape module (mirrors inbound-conversation-event.ts's
// `InboundConversationEvent` role for the inbound arm) — the real BullMQ
// producer/consumer wiring (redis-scheduled-check-scheduler.ts, worker.ts's
// `isScheduledCheckJob` branch) is Phase 5, not this PR.
export interface ScheduledCheckJobData {
  readonly source: "schedule";
  /** D17: the persisted session's own digest — never the raw MSISDN. */
  readonly sessionKey: string;
  /** D17: the citizen MSISDN, carried explicitly — never re-derived from `slots` at fire time. */
  readonly to: string;
  readonly kind: "cita_registration_wait_elapsed";
  /** D31: compared against `session.slots.citaWaitToken` at fire time — a mismatch is a silent no-op. */
  readonly waitToken: string;
  /** D31: compared against `session.state` at fire time — a mismatch is a silent no-op. */
  readonly expectedState: string;
  /** ISO-8601, stamped by the executor at schedule time (conversation-flow.ts), never by `handle()`. */
  readonly scheduledAt: string;
}

export type ConversationJobData = InboundConversationEvent | ScheduledCheckJobData;

/** True for a scheduled-check job (D30) — false for a real Meta-originated inbound job. */
export function isScheduledCheckJob(data: ConversationJobData): data is ScheduledCheckJobData {
  return data.source === "schedule";
}
