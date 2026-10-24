import { SessionState } from "@/lib/enums/session-state";

export const INBOUND_FREE_TEXT_WINDOW_MS = 1_500;
export const INBOUND_MAX_WAIT_MS = 3_000;
export const INBOUND_MAX_BATCH = 10;
export const INBOUND_MAX_AGE_MS = 120_000;
export const INBOUND_REPEAT_WINDOW_MS = 3_000;

const FREE_TEXT_STATES: ReadonlySet<string> = new Set<string>([
  SessionState.MAIN_MENU,
  SessionState.AWAITING_FLOW_START,
  SessionState.CITA_AWAITING_DEPARTAMENTO,
  SessionState.CITA_AWAITING_PROVINCIA,
  SessionState.CITA_AWAITING_DISTRITO,
  SessionState.CITA_AWAITING_DISTRITO_AI,
  SessionState.CITA_AWAITING_OTHER_DISTRITO,
  SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO,
  SessionState.CITA_AWAITING_OTHER_FECHA,
  SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT,
  SessionState.INCIDENCIA_AWAITING_DESCRIPCION,
]);

export function resolveWindowMs(input: { state: string | null; type: string }): number {
  if (input.type !== "text") return 0;
  if (input.state === null) return 0;
  return FREE_TEXT_STATES.has(input.state) ? INBOUND_FREE_TEXT_WINDOW_MS : 0;
}
