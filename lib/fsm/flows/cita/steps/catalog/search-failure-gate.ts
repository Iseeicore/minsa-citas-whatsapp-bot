import { searchFailureText } from "@/lib/fsm/core/failure-texts";
import { buildResult, sendText } from "@/lib/fsm/core/handlers-shared";
import type { SearchSubject } from "@/lib/enums/search-subject";
import { SessionState } from "@/lib/enums/session-state";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";

/** Resuelve los estados `unauthorized` y `error` de una consulta de catálogo; devuelve undefined si el resultado es utilizable. */
export function searchFailureGate(
  next: Session,
  status: string,
  resumeState: SessionState,
  subject: SearchSubject,
): HandlerResult | undefined {
  if (status === "unauthorized") return beginReverification(next, resumeState);
  if (status !== "error") return undefined;
  next.state = SessionState.CITA_BOOKING_REJECTED;
  return buildResult(next, [sendText(searchFailureText(subject))]);
}
