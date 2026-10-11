import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";

export type LatencyStage = "perimeter" | "staged" | "window" | "lock" | "turn" | "first_send" | "reset" | "exists";

export type LatencyEvent = "inbound.latency" | "sandbox.latency";

export type LatencyMarks = {
  mark: (stage: LatencyStage) => void;
  finish: (event: LatencyEvent, fields: { waId: string; channel: "whatsapp" | "web"; traceId?: string }) => void;
};

/** Mide cuánto dura cada etapa desde que el mensaje entra hasta que se responde; una sola línea de log por mensaje. */
export function createLatencyMarks(now: () => number = Date.now): LatencyMarks {
  const startedAt = now();
  let previousAt = startedAt;
  const stagesMs: Partial<Record<LatencyStage, number>> = {};

  return {
    mark(stage) {
      const at = now();
      stagesMs[stage] = at - previousAt;
      previousAt = at;
    },
    finish(event, fields) {
      logger.info(event, {
        ...(fields.traceId ? { traceId: fields.traceId } : {}),
        waId: tail(fields.waId),
        channel: fields.channel,
        stagesMs: { ...stagesMs },
        totalMs: now() - startedAt,
      });
    },
  };
}
