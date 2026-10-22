import { cloneSession, readTappedId, readTypedText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/continuation";
import { offerReferenciasList } from "@/lib/fsm/flows/cita/steps/booking/references";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { CITA_REFERENCIA_MODE_ANSWERS, CITA_REFERENCIA_RETRY_ANSWERS } from "@/lib/constants/palabras-clave";
import { askAppointmentMode, askReferenceLookupRetry } from "@/lib/fsm/flows/referencia/appointment-mode-prompts";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";

const NEW_APPOINTMENT_CLEANUP_SLOTS = [
  SlotKey.POST_LOGIN_FLOW,
  SlotKey.CITA_REFERENCIAS_DATA,
  SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
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
  next.slots[SlotKey.CITA_APPOINTMENT_MODE] = AppointmentMode.NEW;
  return continueCitaAfterVerification(next);
}

function startReferenceAppointment(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_APPOINTMENT_MODE] = AppointmentMode.REFERENCE;
  return offerReferenciasList(next);
}

const MODE_HANDLERS = new Map<string, (session: Session) => HandlerResult>(
  Object.entries({
    [CitaReferenciaButtonId.NEW]: startNewAppointment,
    [CitaReferenciaButtonId.REFERENCE]: startReferenceAppointment,
  } satisfies Record<Exclude<CitaReferenciaButtonId, CitaReferenciaButtonId.RETRY>, (session: Session) => HandlerResult>),
);

const RETRY_HANDLERS = new Map<string, (session: Session) => HandlerResult>(
  Object.entries({
    [CitaReferenciaButtonId.RETRY]: startReferenciasLookup,
    [CitaReferenciaButtonId.NEW]: startNewAppointment,
  } satisfies Record<Exclude<CitaReferenciaButtonId, CitaReferenciaButtonId.REFERENCE>, (session: Session) => HandlerResult>),
);

export function handleAppointmentMode(session: Session, event: InboundEvent): HandlerResult {
  const answer = readTappedId(event) ?? CITA_REFERENCIA_MODE_ANSWERS[normalizeText(readTypedText(event))];
  const handler = answer ? MODE_HANDLERS.get(answer) : undefined;
  return handler ? handler(session) : withRejectionNotice(askAppointmentMode(session));
}

export function handleReferenceLookupRetry(session: Session, event: InboundEvent): HandlerResult {
  const answer = readTappedId(event) ?? CITA_REFERENCIA_RETRY_ANSWERS[normalizeText(readTypedText(event))];
  const handler = answer ? RETRY_HANDLERS.get(answer) : undefined;
  return handler ? handler(session) : withRejectionNotice(askReferenceLookupRetry(session));
}
