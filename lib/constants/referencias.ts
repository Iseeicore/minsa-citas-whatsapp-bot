import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

export const REFERENCIA_ESTADOS_SELECCIONABLES: ReadonlySet<number> = new Set<number>([
  ReferenciaEstadoCodigo.ACEPTADO,
  ReferenciaEstadoCodigo.PACIENTE_RECIBIDO,
]);

export const REFERENCIA_SESSION_STATES: ReadonlySet<string> = new Set<string>([
  SessionState.MAIN_MENU_REFERENCIA_CHOICE,
  SessionState.CITA_AWAITING_REFERENCIA_SELECT,
  SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
  SessionState.CITA_DEMO_AWAITING_REFERENCIA_SELECT,
  SessionState.CITA_DEMO_AWAITING_HORA_SELECT,
  SessionState.CITA_DEMO_AWAITING_CONFIRM,
]);

export const REFERENCIA_SESSION_SLOTS: readonly SlotKey[] = [SlotKey.CITA_REFERENCIAS_DATA, SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
