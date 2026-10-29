import { buildResult, cloneSession, sendText } from "@/lib/fsm/core/handlers-shared";
import { mentionsPlacePreposition } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { askTerminos, needsTerminos } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosResume } from "@/lib/enums/terminos-resume";

export function continueCitaAfterVerification(session: Session): HandlerResult {
  if (needsTerminos(session)) return askTerminos(session, TerminosResume.CONTINUE_VERIFIED);
  return resumeCitaAfterVerification(session);
}

export function resumeCitaAfterVerification(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_DISTRITO_AI;

  const distritoHint = next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
  if (distritoHint) {
    delete next.slots[SlotKey.CITA_DISTRITO_HINT_TEXT];
    return resolveDistritoText(next, distritoHint, next.slots[SlotKey.INITIAL_MESSAGE_TEXT]);
  }

  const initialMessageText = next.slots[SlotKey.INITIAL_MESSAGE_TEXT];
  if (initialMessageText && mentionsPlacePreposition(initialMessageText)) {
    return resolveDistritoText(next, initialMessageText, undefined);
  }

  return buildResult(next, [sendText(VERIFIED_ASK_DISTRITO_TEXT)]);
}
