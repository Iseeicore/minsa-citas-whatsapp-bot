import type { ScheduledCheckJobData } from "../domain/conversation-job.js";

// Driven port keeping BullMQ out of conversation-flow.ts (D29/D30) — mirrors
// SessionStore's exact shape/discipline: a hexagonal driven port with one
// real implementation owned by infrastructure
// (src/adapters/redis-scheduled-check-scheduler.ts, Phase 5), selected
// explicitly by the composition root (src/worker.ts). `handle()` never
// arms a timer itself; this port's `schedule()` is the sole executor of an
// `FsmScheduleEffect` (conversation-flow.ts's `runScheduleEffects`).
export interface ScheduledCheckScheduler {
  /** Enqueues `data` as a delayed job, firing in `delaySeconds` seconds. */
  schedule(data: ScheduledCheckJobData, delaySeconds: number): Promise<void>;

  /** Releases any resources the adapter owns (e.g. the Redis connection). */
  close(): Promise<void>;
}
