import {
  buildResult,
  cloneSession,
  readTappedId,
  readTypedText,
  sendButtons,
  sendText,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { sendMinsaDigitalCta } from "@/lib/fsm/core/minsa-digital-cta";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { abandonCita } from "@/lib/fsm/flows/cita/steps/exit/exit-core";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { MINSA_DIGITAL_LOGIN_PATH } from "@/lib/integrations/minsa/wire";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { CUENTA_MINSA_ANSWERS } from "@/lib/constants/palabras-clave";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import {
  CUENTA_MINSA_AVISO_BUTTONS,
  CUENTA_MINSA_AVISO_TEXT,
  CUENTA_MINSA_CREADA_BUTTONS,
  CUENTA_MINSA_CREADA_TEXT,
  CUENTA_MINSA_CREAR_BUTTON_TEXT,
  CUENTA_MINSA_CREAR_TEXT,
} from "@/lib/constants/textos/cita-identidad";
import { Confirmation } from "@/lib/enums/confirmation";
import { CuentaMinsaButtonId } from "@/lib/enums/cuenta-minsa-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

type CuentaAnswerIds = { yes: CuentaMinsaButtonId; no: CuentaMinsaButtonId };

const AVISO_ANSWERS: CuentaAnswerIds = { yes: CuentaMinsaButtonId.TIENE, no: CuentaMinsaButtonId.NO_TIENE };
const CREADA_ANSWERS: CuentaAnswerIds = { yes: CuentaMinsaButtonId.TIENE, no: CuentaMinsaButtonId.NO_CONTINUAR };

function readCuentaAnswer(event: InboundEvent, ids: CuentaAnswerIds): Confirmation {
  const tapped = readTappedId(event);
  const typed = readTypedText(event);
  const chosen = tapped ?? CUENTA_MINSA_ANSWERS.get(normalizeText(typed));
  if (chosen === ids.yes) return Confirmation.YES;
  if (chosen === ids.no) return Confirmation.NO;
  if (chosen) return Confirmation.UNKNOWN;
  return resolveConfirmation(typed);
}

export function askCitaDocumento(session: Session, intro: string): HandlerResult {
  return buildResult({ ...session, state: SessionState.CITA_AWAITING_DNI }, [sendText(intro)]);
}

export function askCuentaMinsa(session: Session, intro: string): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DOCUMENTO_INTRO_TEXT] = intro;
  next.state = SessionState.CITA_AWAITING_CUENTA_MINSA;
  return reshowCuentaMinsa(next);
}

export function reshowCuentaMinsa(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(CUENTA_MINSA_AVISO_TEXT, CUENTA_MINSA_AVISO_BUTTONS)]);
}

export function reshowCuentaMinsaCreada(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(CUENTA_MINSA_CREADA_TEXT, CUENTA_MINSA_CREADA_BUTTONS)]);
}

function continueToDocumento(session: Session): HandlerResult {
  const intro = slotText(session.slots, SlotKey.CITA_DOCUMENTO_INTRO_TEXT) || ASK_DOCUMENTO_TEXT;
  const next = cloneSession(session);
  delete next.slots[SlotKey.CITA_DOCUMENTO_INTRO_TEXT];
  return askCitaDocumento(next, intro);
}

function inviteToCreateCuenta(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_CUENTA_MINSA_CREADA;
  return buildResult(next, [
    sendMinsaDigitalCta(CUENTA_MINSA_CREAR_TEXT, CUENTA_MINSA_CREAR_BUTTON_TEXT, MINSA_DIGITAL_LOGIN_PATH),
    sendButtons(CUENTA_MINSA_CREADA_TEXT, CUENTA_MINSA_CREADA_BUTTONS),
  ]);
}

export function handleAwaitingCuentaMinsa(session: Session, event: InboundEvent): HandlerResult {
  const answer = readCuentaAnswer(event, AVISO_ANSWERS);
  if (answer === Confirmation.YES) return continueToDocumento(session);
  if (answer === Confirmation.NO) return inviteToCreateCuenta(session);
  return withRejectionNotice(reshowCuentaMinsa(session));
}

export function handleAwaitingCuentaMinsaCreada(session: Session, event: InboundEvent): HandlerResult {
  const answer = readCuentaAnswer(event, CREADA_ANSWERS);
  if (answer === Confirmation.YES) return continueToDocumento(session);
  if (answer === Confirmation.NO) return abandonCita(session, session.state);
  return withRejectionNotice(reshowCuentaMinsaCreada(session));
}
