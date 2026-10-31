import { reshowReferenciaConfirmation } from "@/lib/fsm/flows/cita/steps/booking/references";
import { reshowAlreadyBookedChoice } from "@/lib/fsm/flows/cita/steps/booking/already-booked";
import { reshowBookingRetry } from "@/lib/fsm/flows/cita/steps/booking/booking-retry";
import { reshowEstablecimientoConfirm } from "@/lib/fsm/flows/cita/steps/catalog/establecimiento-offer";
import { reshowCuentaMinsa, reshowCuentaMinsaCreada } from "@/lib/fsm/flows/cita/steps/cuenta-minsa/cuenta-minsa";
import { reshowTerminos } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import { askCitaOffer } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { askOtherReference } from "@/lib/fsm/flows/referencia/other-reference";
import { askReferenciaChoice } from "@/lib/fsm/routing/flow-entry";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SessionState } from "@/lib/enums/session-state";

type ButtonReprompt = (session: Session) => HandlerResult;

const BUTTON_REPROMPTS = new Map<string, ButtonReprompt>([
  [SessionState.CITA_AWAITING_REFERENCIA_CONFIRM, reshowReferenciaConfirmation],
  [SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM, reshowEstablecimientoConfirm],
  [SessionState.REFERENCIA_AWAITING_CITA_OFFER, askCitaOffer],
  [SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE, askOtherReference],
  [SessionState.CITA_AWAITING_TERMINOS, reshowTerminos],
  [SessionState.CITA_AWAITING_CUENTA_MINSA, reshowCuentaMinsa],
  [SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA, reshowCuentaMinsaCreada],
  [SessionState.MAIN_MENU_REFERENCIA_CHOICE, askReferenciaChoice],
  [SessionState.CITA_AWAITING_ALREADY_BOOKED_CHOICE, reshowAlreadyBookedChoice],
  [SessionState.CITA_AWAITING_BOOKING_RETRY, reshowBookingRetry],
]);

export function findButtonReprompt(state: string): ButtonReprompt | undefined {
  return BUTTON_REPROMPTS.get(state);
}
