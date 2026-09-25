import { buildResult, cloneSession, query, sendText, sendButtons } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { clearOffered } from "@/lib/fsm/flows/cita/selection";
import { formatHora12, ONLY_HORA_FLAG, HORA_CONFIRM_YES_ID, HORA_CONFIRM_NO_ID } from "@/lib/fsm/flows/cita/steps/hora/format";

// Booking is the one step that can't be quietly undone, so a time that came
// from typed text — or the only one there is — is confirmed first. Tapping a
// list row books directly.
//
// `only` marks "this is the only horario on offer, nobody picked it": the
// question says so, and a "no" has no list of the same day to go back to.
export function askHoraConfirmation(session: Session, slotId: string, options: { only?: boolean } = {}): HandlerResult {
  const [start, end] = slotId.split("|");
  const next = cloneSession(session);
  next.state = "cita_awaiting_hora_confirm";
  // citaHoraConfirmId keeps the RAW 24h slot (start|end): it is what gets booked
  // and what startBooking/handleHoraConfirm read back. Only the sentence below
  // is reformatted for the citizen — via formatHora12, in 12h with AM/PM.
  next.slots.citaHoraConfirmId = slotId;
  if (options.only) next.slots.citaHoraConfirmOnly = ONLY_HORA_FLAG;
  else delete next.slots.citaHoraConfirmOnly;

  const range = `${formatHora12(start)} - ${formatHora12(end)}`;
  return buildResult(next, [
    options.only
      ? sendButtons(`Solo hay un horario disponible: ${range}. ¿Lo confirmas?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, gracias" },
        ])
      : sendButtons(`¿Confirmas el horario ${range}?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, ver horarios" },
        ]),
  ]);
}

export function startBooking(session: Session, horaInicio: string): HandlerResult {
  const next = clearOffered(session);
  delete next.slots.citaHorasDia;
  delete next.slots.citaHoraConfirmId;
  delete next.slots.citaHoraConfirmOnly;
  delete next.slots.citaHoraChoiceA;
  delete next.slots.citaHoraChoiceB;
  next.state = "cita_booking_pending";
  return buildResult(next, [
    sendText("Agendando tu cita…"),
    query("book_appointment", {
      codigoRenipress: String(next.slots.citaCodEess ?? ""),
      codigoUps: String(next.slots.citaEspecialidadId ?? ""),
      fechaCita: String(next.slots.citaFecha ?? ""),
      horaInicio,
      numeroDocumentoPaciente: String(next.slots.citaDni ?? ""),
    }),
  ]);
}
