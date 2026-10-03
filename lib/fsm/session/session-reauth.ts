import { buildResult, query, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { resumeStateFor } from "@/lib/fsm/session/session-expiry-guard";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { REAUTH_NO_ID, REAUTH_STATE, REAUTH_YES_ID, reauthPrompt } from "@/lib/fsm/session/reauth-prompt";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const TRANSIENT_BOOKING_SLOTS = [
  SlotKey.CITA_BEARER,
  SlotKey.CITA_HORAS_DIA,
  SlotKey.CITA_HORA_CONFIRM_ID,
  SlotKey.CITA_HORA_CONFIRM_ONLY,
  SlotKey.CITA_HORA_CHOICE_A,
  SlotKey.CITA_HORA_CHOICE_B,
  SlotKey.CITA_OFFERED,
  SlotKey.CITA_OFFERED_NAMES,
];

export function beginSessionReauth(session: Session): HandlerResult {
  const next: Session = {
    state: REAUTH_STATE,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };
  for (const slot of TRANSIENT_BOOKING_SLOTS) delete next.slots[slot];
  delete next.counters[CounterKey.CITA_HORA_PAGE];
  delete next.slots[SlotKey.CITA_EXIT_RESUME_STATE];

  const resumeState = resumeStateFor(session.state, session.slots);
  if (resumeState) next.slots[SlotKey.CITA_RESUME_STATE] = resumeState;

  return buildResult(next, [reauthPrompt()]);
}

export function handleAwaitingReauth(session: Session, event: InboundEvent): HandlerResult {
  const tapped =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (tapped === REAUTH_NO_ID || typed === Confirmation.NO) return askToLeave(session, "reauth");

  if (tapped === REAUTH_YES_ID || typed === Confirmation.YES) {
    const dni = session.slots[SlotKey.CITA_DNI];
    const next: Session = { state: SessionState.CITA_AWAITING_DNI, slots: { ...session.slots }, counters: { ...session.counters } };

    if (typeof dni !== "string" || dni === "") {
      return buildResult(next, [sendText("Para enviarte un nuevo código, ingresa tu número de documento (8 dígitos).")]);
    }

    next.state = SessionState.CITA_VALIDATE_PENDING;
    next.slots[SlotKey.CITA_DNI_PENDING] = dni;
    return buildResult(next, [
      sendText("Enviándote un nuevo código de verificación…"),
      query(QueryKind.VALIDATE_USER, { numeroDocumento: dni }),
    ]);
  }

  return withNote(buildResult(session, [reauthPrompt()]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "session_reauth" },
  });
}
