import { buildResult, sendButtons } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import {
  CITA_REFERENCIA_MODE_BUTTONS,
  CITA_REFERENCIA_MODE_QUESTION_TEXT,
  CITA_REFERENCIA_RETRY_BUTTONS,
  CITA_REFERENCIA_LOOKUP_RETRY_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-referencia";
import { SessionState } from "@/lib/enums/session-state";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { SlotKey } from "@/lib/enums/slot-key";

function appointmentState(session: Session, state: Session["state"]): Session {
  return { ...session, state, slots: { ...session.slots, [SlotKey.POST_LOGIN_FLOW]: PostLoginFlow.CITA_REFERENCIAS } };
}

export function askAppointmentMode(session: Session): HandlerResult {
  return buildResult(appointmentState(session, SessionState.REFERENCIA_AWAITING_APPOINTMENT_MODE), [
    sendButtons(CITA_REFERENCIA_MODE_QUESTION_TEXT, CITA_REFERENCIA_MODE_BUTTONS),
  ]);
}

export function askReferenceLookupRetry(session: Session): HandlerResult {
  return buildResult(appointmentState(session, SessionState.REFERENCIA_AWAITING_LOOKUP_RETRY), [
    sendButtons(CITA_REFERENCIA_LOOKUP_RETRY_QUESTION_TEXT, CITA_REFERENCIA_RETRY_BUTTONS),
  ]);
}
