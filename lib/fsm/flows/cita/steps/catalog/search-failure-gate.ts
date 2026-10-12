import { buildResult, sendText } from "@/lib/fsm/core/handlers-shared";
import type { SearchSubject } from "@/lib/enums/search-subject";
import { SessionState } from "@/lib/enums/session-state";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { searchFailureText } from "@/lib/constants/textos/fallas";
import { CatalogStatus } from "@/lib/enums/catalog-status";

export function searchFailureGate(
  next: Session,
  status: string,
  resumeState: SessionState,
  subject: SearchSubject,
): HandlerResult | undefined {
  if (status === CatalogStatus.UNAUTHORIZED) return beginReverification(next, resumeState);
  if (status !== CatalogStatus.ERROR) return undefined;
  next.state = SessionState.CITA_BOOKING_REJECTED;
  return buildResult(next, [sendText(searchFailureText(subject))]);
}
