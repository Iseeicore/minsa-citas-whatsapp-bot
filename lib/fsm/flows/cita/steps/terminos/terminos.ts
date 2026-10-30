import {
  buildResult,
  cloneSession,
  query,
  readTappedId,
  readTypedText,
  sendText,
  withNote,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { channelOf } from "@/lib/fsm/core/channel";
import { askCitaDocumento, reshowTerminos } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import { resumeCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/continuation";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { slotText } from "@/lib/fsm/core/slot-readers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { TERMINOS_ANSWERS } from "@/lib/constants/palabras-clave";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import { TERMINOS_RECHAZADOS_TEXT, TERMINOS_VERSION } from "@/lib/constants/textos/terminos";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import { TerminosResume } from "@/lib/enums/terminos-resume";

const TERMINOS_BUTTON_IDS: ReadonlySet<string> = new Set(Object.values(TerminosButtonId));
const TERMINOS_RESUMES: ReadonlySet<string> = new Set(Object.values(TerminosResume));

const RESUME_HANDLERS: Readonly<Record<TerminosResume, (session: Session, intro: string) => HandlerResult>> = {
  [TerminosResume.ASK_DOCUMENTO]: askCitaDocumento,
  [TerminosResume.CONTINUE_VERIFIED]: (session) => resumeCitaAfterVerification(session),
};

function findTerminosAnswer(event: InboundEvent): TerminosButtonId | undefined {
  const tapped = readTappedId(event);
  if (tapped) return TERMINOS_BUTTON_IDS.has(tapped) ? (tapped as TerminosButtonId) : undefined;
  return TERMINOS_ANSWERS.get(normalizeText(readTypedText(event)));
}

function findTerminosResume(session: Session): TerminosResume | undefined {
  const resume = slotText(session.slots, SlotKey.TERMINOS_RESUME);
  return TERMINOS_RESUMES.has(resume) ? (resume as TerminosResume) : undefined;
}

function acceptTerminos(session: Session, event: InboundEvent): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.TERMINOS_ACEPTADOS] = true;
  next.state = SessionState.CITA_TERMINOS_REGISTER_PENDING;
  return buildResult(next, [
    query(QueryKind.REGISTRAR_ACEPTACION_TERMINOS, { canal: channelOf(session, event), version: TERMINOS_VERSION }),
  ]);
}

function declineTerminos(): HandlerResult {
  return withNote(
    buildResult({ state: SessionState.CITA_TERMINOS_DECLINED, slots: {}, counters: {} }, [sendText(TERMINOS_RECHAZADOS_TEXT)]),
    {
      kind: "cita_closed",
      detail: { reason: "terminos_declined" },
    },
  );
}

const ANSWER_HANDLERS: Readonly<Record<TerminosButtonId, (session: Session, event: InboundEvent) => HandlerResult>> = {
  [TerminosButtonId.ACCEPT]: acceptTerminos,
  [TerminosButtonId.DECLINE]: declineTerminos,
};

export function handleAwaitingTerminos(session: Session, event: InboundEvent): HandlerResult {
  const answer = findTerminosAnswer(event);
  if (!answer) return withRejectionNotice(reshowTerminos(session));
  return ANSWER_HANDLERS[answer](session, event);
}

export function handleTerminosRegisterPending(session: Session): HandlerResult {
  const resume = findTerminosResume(session) ?? TerminosResume.ASK_DOCUMENTO;
  const intro = slotText(session.slots, SlotKey.TERMINOS_INTRO_TEXT) || ASK_DOCUMENTO_TEXT;
  const next = cloneSession(session);
  delete next.slots[SlotKey.TERMINOS_RESUME];
  delete next.slots[SlotKey.TERMINOS_INTRO_TEXT];
  return RESUME_HANDLERS[resume](next, intro);
}
