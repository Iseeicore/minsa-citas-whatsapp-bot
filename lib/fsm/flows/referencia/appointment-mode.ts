import { cloneSession, readTappedId, readTypedText, withRejectionNotice } from "@/lib/fsm/core/handlers-shared";
import { offerSelectableReferencias } from "@/lib/fsm/flows/cita/steps/booking/references";
import { startNewAppointment } from "@/lib/fsm/flows/referencia/new-appointment";
import { startReferenciasLookup } from "@/lib/fsm/flows/referencia/lookup";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { CITA_REFERENCIA_MODE_ANSWERS, CITA_REFERENCIA_RETRY_ANSWERS } from "@/lib/constants/palabras-clave";
import { askAppointmentMode, askReferenceLookupRetry } from "@/lib/fsm/flows/referencia/appointment-mode-prompts";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { CitaReferenciaButtonId } from "@/lib/enums/cita-referencia-button-id";
import { SlotKey } from "@/lib/enums/slot-key";

function startReferenceAppointment(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_APPOINTMENT_MODE] = AppointmentMode.REFERENCE;
  return offerSelectableReferencias(next);
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
  const answer = readTappedId(event) ?? CITA_REFERENCIA_MODE_ANSWERS.get(normalizeText(readTypedText(event)));
  const handler = answer ? MODE_HANDLERS.get(answer) : undefined;
  return handler ? handler(session) : withRejectionNotice(askAppointmentMode(session));
}

export function handleReferenceLookupRetry(session: Session, event: InboundEvent): HandlerResult {
  const answer = readTappedId(event) ?? CITA_REFERENCIA_RETRY_ANSWERS.get(normalizeText(readTypedText(event)));
  const handler = answer ? RETRY_HANDLERS.get(answer) : undefined;
  return handler ? handler(session) : withRejectionNotice(askReferenceLookupRetry(session));
}
