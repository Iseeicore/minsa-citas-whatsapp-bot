import { readTappedId, readTypedText, sendButtons } from "@/lib/fsm/core/handlers-shared";
import { isReferenceAppointment } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { restartReferenceSelection } from "@/lib/fsm/flows/cita/steps/booking/references";
import { isOtherReferenceAcceptance } from "@/lib/fsm/flows/referencia/other-reference";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { uniqueBy } from "@/lib/utils/array-values";
import type { ButtonOption, HandleEvent, HandlerResult, Session } from "@/lib/fsm/core/types";
import { CHANGE_REFERENCE_ANSWERS } from "@/lib/constants/palabras-clave";
import { CITA_REFERENCIA_CHANGE_BUTTON, CITA_REFERENCIA_CHANGE_PROMPT_TEXT } from "@/lib/constants/textos/cita-referencia";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { SendType } from "@/lib/enums/send-type";
import { SessionState } from "@/lib/enums/session-state";

const CHANGE_REFERENCE_STATES: ReadonlySet<Session["state"]> = new Set([
  SessionState.CITA_AWAITING_FECHA_SELECT,
  SessionState.CITA_AWAITING_HORA_SELECT,
  SessionState.CITA_AWAITING_HORA_CONFIRM,
  SessionState.CITA_AWAITING_HORA_CHOICE,
  SessionState.CITA_AWAITING_OTHER_FECHA,
  SessionState.CITA_AWAITING_REFERENCIA_CONFIRM,
]);

function canChangeReference(session: Session): boolean {
  return isReferenceAppointment(session) && CHANGE_REFERENCE_STATES.has(session.state);
}

function referenceActions(buttons: readonly ButtonOption[]): ButtonOption[] {
  return uniqueBy([...buttons, CITA_REFERENCIA_CHANGE_BUTTON], (button) => button.id);
}

function addListActions(result: HandlerResult): HandlerResult {
  const buttons = result.effects.flatMap((effect) => (effect.kind === SendType.BUTTONS ? effect.buttons : []));
  const effects = result.effects.flatMap<HandlerResult["effects"][number]>((effect) => {
    if (effect.kind === SendType.BUTTONS) return [];
    return effect.kind === SendType.INTERACTIVE_LIST
      ? [{ ...effect, actions: referenceActions([...(effect.actions ?? []), ...buttons]) }]
      : [effect];
  });
  return { ...result, effects };
}

export function withReferenceChangeAction(result: HandlerResult): HandlerResult {
  if (!canChangeReference(result.session)) return result;
  if (result.effects.some((effect) => effect.kind === SendType.INTERACTIVE_LIST)) return addListActions(result);
  const hasButtons = result.effects.some((effect) => effect.kind === SendType.BUTTONS);
  const effects = result.effects.map((effect) =>
    effect.kind === SendType.BUTTONS ? { ...effect, buttons: referenceActions(effect.buttons) } : effect,
  );
  if (!hasButtons) effects.push(sendButtons(CITA_REFERENCIA_CHANGE_PROMPT_TEXT, [CITA_REFERENCIA_CHANGE_BUTTON]));
  return { ...result, effects };
}

export function isChangeReferenceRequest(session: Session, event: HandleEvent): boolean {
  if (event.type === InternalEventType.QUERY_RESULT || !canChangeReference(session)) return false;
  return readTappedId(event) === ReferenciaActionButtonId.CHANGE || CHANGE_REFERENCE_ANSWERS.has(normalizeText(readTypedText(event)));
}

export function referenceChangeReauthSession(session: Session, event: HandleEvent): Session {
  return isChangeReferenceRequest(session, event) || isOtherReferenceAcceptance(session, event)
    ? restartReferenceSelection(session).session
    : session;
}

export function handleChangeReference(session: Session, event: HandleEvent): HandlerResult | undefined {
  return isChangeReferenceRequest(session, event) ? restartReferenceSelection(session) : undefined;
}
