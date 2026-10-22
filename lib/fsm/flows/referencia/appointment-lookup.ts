import { cloneSession, withLeadingText } from "@/lib/fsm/core/handlers-shared";
import { offerReferenciasList } from "@/lib/fsm/flows/cita/steps/booking/references";
import { askAppointmentMode, askReferenceLookupRetry } from "@/lib/fsm/flows/referencia/appointment-mode-prompts";
import { startNewAppointment } from "@/lib/fsm/flows/referencia/appointment-mode";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { CITA_REFERENCIA_LOOKUP_ERROR_TEXT, CITA_REFERENCIA_NONE_TEXT } from "@/lib/constants/textos/cita-referencia";
import { AppointmentMode } from "@/lib/enums/appointment-mode";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { SlotKey } from "@/lib/enums/slot-key";

function lookupFailed(session: Session): HandlerResult {
  return withLeadingText(askReferenceLookupRetry(session), CITA_REFERENCIA_LOOKUP_ERROR_TEXT);
}

function foundReferences(session: Session, items: ReferenciaItem[]): HandlerResult {
  if (items.length === 0) return lookupFailed(session);
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(items);
  return next.slots[SlotKey.CITA_APPOINTMENT_MODE] === AppointmentMode.REFERENCE ? offerReferenciasList(next) : askAppointmentMode(next);
}

const LOOKUP_HANDLERS: Readonly<Record<ReferenceStatus, (session: Session, items: ReferenciaItem[]) => HandlerResult>> = {
  [ReferenceStatus.FOUND]: foundReferences,
  [ReferenceStatus.EMPTY]: (session) => withLeadingText(startNewAppointment(session), CITA_REFERENCIA_NONE_TEXT),
  [ReferenceStatus.ERROR]: lookupFailed,
};

export function handleAppointmentReferenceLookup(session: Session, result: ListReferencesResult): HandlerResult {
  const handler = LOOKUP_HANDLERS[result.statusReference];
  return handler ? handler(session, result.data) : lookupFailed(session);
}
