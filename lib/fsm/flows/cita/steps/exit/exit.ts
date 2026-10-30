import { detectExitIntent } from "@/lib/fsm/parsing/selection/exit-intent";
import { detectChangeDistritoIntent } from "@/lib/fsm/parsing/selection/change-distrito-intent";
import { offerChangeDistrito } from "@/lib/fsm/flows/cita/steps/catalog/no-coverage";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { buildResult, cloneSession, sendText, withNote, readTappedId, readTypedText } from "@/lib/fsm/core/handlers-shared";
import { reshowOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { handleRegistrationWait } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { abandonCita, askToLeave, exitButtons } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import { reshowCuentaMinsa, reshowCuentaMinsaCreada } from "@/lib/fsm/flows/cita/steps/cuenta-minsa/cuenta-minsa";
import { reshowReferenciaConfirmation } from "@/lib/fsm/flows/cita/steps/booking/references";
import { reshowEstablecimientoConfirm } from "@/lib/fsm/flows/cita/steps/catalog/establecimiento-offer";
import { askCitaOffer } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { askOtherReference } from "@/lib/fsm/flows/referencia/other-reference";
import { reauthPrompt } from "@/lib/fsm/session/reauth-prompt";
import { reshowTerminos } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type { HandleEvent, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { ASK_OTP_TEXT, ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import {
  ASK_DISTRITO_NOMBRE_TEXT,
  ASK_DEPARTAMENTO_TEXT,
  ASK_PROVINCIA_TEXT,
  ASK_DISTRITO_MANUAL_TEXT,
} from "@/lib/constants/textos/cita-ubicacion";
import { LEAVE_ANSWERS, STAY_ANSWERS } from "@/lib/constants/palabras-clave";
import { ExitButtonId } from "@/lib/enums/exit-button-id";
import { slotText } from "@/lib/fsm/core/slot-readers";

export { askToLeave };

const TEXT_PROMPTS: Readonly<Record<string, string>> = {
  [SessionState.CITA_AWAITING_DNI]: ASK_DOCUMENTO_TEXT,
  [SessionState.CITA_AWAITING_OTP]: ASK_OTP_TEXT,
  [SessionState.CITA_AWAITING_DISTRITO_AI]: ASK_DISTRITO_NOMBRE_TEXT,
  [SessionState.CITA_AWAITING_DEPARTAMENTO]: ASK_DEPARTAMENTO_TEXT,
  [SessionState.CITA_AWAITING_PROVINCIA]: ASK_PROVINCIA_TEXT,
  [SessionState.CITA_AWAITING_DISTRITO]: ASK_DISTRITO_MANUAL_TEXT,
};

const LIST_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION,
  SessionState.CITA_AWAITING_UBIGEO_SELECT,
  SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT,
  SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT,
  SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM,
  SessionState.CITA_AWAITING_FECHA_SELECT,
  SessionState.CITA_AWAITING_HORA_SELECT,
  SessionState.CITA_AWAITING_REFERENCIA_SELECT,
  SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
  SessionState.REFERENCIA_AWAITING_CITA_OFFER,
  SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE,
  SessionState.CITA_AWAITING_TERMINOS,
  SessionState.CITA_AWAITING_CUENTA_MINSA,
  SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA,
]);

const BUTTON_REPROMPTS: Readonly<Record<string, ((session: Session) => HandlerResult) | undefined>> = {
  [SessionState.CITA_AWAITING_REFERENCIA_CONFIRM]: reshowReferenciaConfirmation,
  [SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM]: reshowEstablecimientoConfirm,
  [SessionState.REFERENCIA_AWAITING_CITA_OFFER]: askCitaOffer,
  [SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE]: askOtherReference,
  [SessionState.CITA_AWAITING_TERMINOS]: reshowTerminos,
  [SessionState.CITA_AWAITING_CUENTA_MINSA]: reshowCuentaMinsa,
  [SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA]: reshowCuentaMinsaCreada,
};

const CHANGE_DISTRITO_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT,
  SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT,
]);

const canLeaveFrom = (state: string): boolean =>
  state in TEXT_PROMPTS || LIST_STATES.has(state) || state === SessionState.CITA_REGISTRATION_WAIT;

export function offerExitIfRequested(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== InboundEventType.TEXT || !event.text || !canLeaveFrom(session.state)) return undefined;
  if (detectExitIntent(event.text)) return askToLeave(session, "local");
  if (CHANGE_DISTRITO_STATES.has(session.state) && detectChangeDistritoIntent(event.text)) {
    return offerChangeDistrito(session, "local");
  }
  return undefined;
}

function resume(session: Session, event: InboundEvent): HandlerResult {
  const restored = cloneSession(session);
  restored.state = String(session.slots[SlotKey.CITA_EXIT_RESUME_STATE] ?? SessionState.CITA_AWAITING_DNI) as Session["state"];
  delete restored.slots[SlotKey.CITA_EXIT_RESUME_STATE];

  if (restored.state === SessionState.CITA_AWAITING_REAUTH) return buildResult(restored, [reauthPrompt()]);
  const prompt = TEXT_PROMPTS[restored.state];
  if (prompt) return buildResult(restored, [sendText(prompt)]);
  if (restored.state === SessionState.CITA_REGISTRATION_WAIT)
    return handleRegistrationWait(restored, { ...event, type: InboundEventType.TEXT, text: "" });
  const reprompt = BUTTON_REPROMPTS[restored.state];
  if (reprompt) return reprompt(restored);
  return reshowOffered(restored, readOffered(restored.slots));
}

export function handleExitConfirm(session: Session, event: InboundEvent): HandlerResult {
  const tapped = readTappedId(event);
  const typed = readTypedText(event);
  const normalized = normalizeText(typed);
  const answer =
    LEAVE_ANSWERS.has(normalized) || (typed && detectExitIntent(typed))
      ? Confirmation.YES
      : STAY_ANSWERS.has(normalized)
        ? Confirmation.NO
        : resolveConfirmation(typed);

  if (tapped === ExitButtonId.YES || answer === Confirmation.YES) {
    return abandonCita(session, slotText(session.slots, SlotKey.CITA_EXIT_RESUME_STATE));
  }

  if (tapped === ExitButtonId.NO || answer === Confirmation.NO) return resume(session, event);

  return withNote(buildResult(session, [exitButtons(session)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "exit_confirm" },
  });
}
