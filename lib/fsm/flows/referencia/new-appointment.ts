import { cloneSession } from "@/lib/fsm/core/handlers-shared";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/continuation";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";

const NEW_APPOINTMENT_CLEANUP_SLOTS = [
  SlotKey.POST_LOGIN_FLOW,
  SlotKey.CITA_REFERENCIAS_DATA,
  SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
  SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
  SlotKey.CITA_DISTRITO,
  SlotKey.CITA_DEPARTAMENTO,
  SlotKey.CITA_PROVINCIA,
  SlotKey.CITA_UBIGEO,
  SlotKey.CITA_SELECTION_STEP,
  SlotKey.CITA_FECHA,
  SlotKey.CITA_FECHAS_DESCARTADAS,
  SlotKey.CITA_ESTABLECIMIENTOS_DESCARTADOS,
  SlotKey.CITA_ESPECIALIDADES_DESCARTADAS,
  SlotKey.CITA_ESTABLECIMIENTO_SIN_FECHAS,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO,
  SlotKey.CITA_ESTABLECIMIENTO_PROPUESTO_NOMBRE,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_HORA_CONFIRM_ID,
  SlotKey.CITA_HORA_CONFIRM_ONLY,
  SlotKey.CITA_HORA_CHOICE_A,
  SlotKey.CITA_HORA_CHOICE_B,
  SlotKey.CITA_RESUME_STATE,
];

export function startNewAppointment(session: Session): HandlerResult {
  const next = cloneSession(session);
  for (const slot of NEW_APPOINTMENT_CLEANUP_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_LIST_PAGE];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE];
  delete next.counters[CounterKey.CITA_ESTABLECIMIENTOS_TOTAL_PAGES];
  delete next.counters[CounterKey.CITA_BOOKING_FAILURES];
  delete next.counters[CounterKey.DISTRITO_NOT_FOUND];
  return continueCitaAfterVerification(next);
}
