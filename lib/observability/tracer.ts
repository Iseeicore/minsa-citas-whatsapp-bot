import { createHash } from "node:crypto";
import { activeTrace, runWithTrace } from "@/lib/observability/context";
import { logger as appLogger, type AppLogger } from "@/lib/observability/logger";
import { previewInput, sanitizeSlots, tail } from "@/lib/observability/mask";
import type { ExternalService, TurnNote } from "@/lib/observability/types";

export type TraceSession = { state: string; slots: Record<string, unknown> };
export type TraceEvent = { type: string; text?: string; listId?: string; messageId?: string };

export function deriveTraceId(waId: string, seed: string): string {
  return `t-${createHash("sha256").update(`${waId}|${seed}`).digest("hex").slice(0, 12)}`;
}

export function traceIdFor(waId: string, event: TraceEvent, startedAt: number): string {
  const seed = event.messageId ?? `${startedAt}|${event.type}|${(event.text ?? event.listId ?? "").length}`;
  return deriveTraceId(waId, seed);
}

export type TurnTrace = {
  readonly traceId: string;
  note: (note: TurnNote) => void;
  external: <T>(service: ExternalService, operation: string, run: () => Promise<T>) => Promise<T>;
  complete: (outcome: { session: TraceSession; sentCount: number }) => void;
  finish: () => void;
  fail: (error: unknown) => void;
};

type TraceOptions = { now?: () => number; log?: AppLogger };

const statusOf = (result: unknown): string | undefined =>
  typeof result === "object" && result !== null && typeof (result as { status?: unknown }).status === "string"
    ? (result as { status: string }).status
    : undefined;

function diffSlots(before: Record<string, unknown>, after: Record<string, unknown>) {
  const added = Object.keys(after).filter((key) => !(key in before));
  const removed = Object.keys(before).filter((key) => !(key in after));
  const changed = Object.keys(after).filter(
    (key) => key in before && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  return { added, removed, changed };
}

export function createTurnTrace(
  waId: string,
  event: TraceEvent,
  session: TraceSession,
  options: TraceOptions = {},
): TurnTrace {
  const now = options.now ?? Date.now;
  const log = options.log ?? appLogger;
  const startedAt = now();
  const traceId = traceIdFor(waId, event, startedAt);
  const slotsBefore = { ...session.slots };
  const notes: TurnNote[] = [];
  let externalCalls = 0;
  let externalMs = 0;
  let outcome: { session: TraceSession; sentCount: number } | undefined;

  log.info("turn.start", {
    traceId,
    waId: tail(waId),
    stateBefore: session.state,
    eventType: event.type,
    ...(event.listId ? { listId: event.listId } : {}),
    ...previewInput(session.state, event.text),
  });

  return {
    traceId,

    note(note) {
      notes.push(note);
      log[note.level === "warn" ? "warn" : "info"]("turn.note", {
        traceId,
        stateBefore: session.state,
        kind: note.kind,
        ...note.detail,
      });
    },

    async external(service, operation, run) {
      const started = now();
      try {
        const result = await run();
        const durationMs = now() - started;
        externalCalls++;
        externalMs += durationMs;
        const resultStatus = statusOf(result);
        log[resultStatus === "error" || resultStatus === "unauthorized" ? "warn" : "info"]("turn.external", {
          traceId,
          service,
          operation,
          durationMs,
          outcome: "ok",
          ...(resultStatus ? { resultStatus } : {}),
        });
        return result;
      } catch (error) {
        const durationMs = now() - started;
        externalCalls++;
        externalMs += durationMs;
        log.error("turn.external", { traceId, service, operation, durationMs, outcome: "error", error });
        throw error;
      }
    },

    complete(result) {
      outcome = result;
    },

    finish() {
      const stateAfter = outcome?.session.state;
      const stalled = stateAfter !== undefined && stateAfter === session.state && event.type === "text";
      const answeredByShortcut = notes.some((note) => note.kind === "shortcut" || note.kind === "first_contact");
      const friction =
        stalled && !answeredByShortcut ? (stateAfter === "main_menu" ? "menu_loop" : "no_progress") : undefined;

      log[friction === "menu_loop" ? "warn" : "info"]("turn.end", {
        traceId,
        waId: tail(waId),
        stateBefore: session.state,
        ...(outcome ? { stateAfter } : {}),
        eventType: event.type,
        durationMs: now() - startedAt,
        externalCalls,
        externalMs,
        ...(outcome ? { sentCount: outcome.sentCount, slots: sanitizeSlots(outcome.session.slots), slotsChanged: diffSlots(slotsBefore, outcome.session.slots) } : {}),
        notes: notes.map((note) => note.kind),
        ...(friction ? { friction } : {}),
      });
    },

    fail(error) {
      log.error("turn.failed", {
        traceId,
        waId: tail(waId),
        stateBefore: session.state,
        eventType: event.type,
        durationMs: now() - startedAt,
        error,
      });
    },
  };
}

export async function traceTurn<T>(
  waId: string,
  event: TraceEvent,
  session: TraceSession,
  run: (trace: TurnTrace) => Promise<T>,
  options?: TraceOptions,
): Promise<T> {
  const active = activeTrace<TurnTrace>();
  if (active) return run(active);

  const trace = createTurnTrace(waId, event, session, options);
  return runWithTrace(trace.traceId, trace, async () => {
    try {
      const result = await run(trace);
      trace.finish();
      return result;
    } catch (error) {
      trace.fail(error);
      throw error;
    }
  });
}
