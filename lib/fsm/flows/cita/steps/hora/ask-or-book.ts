import { buildResult, cloneSession, query, sendText, sendButtons } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { referenciaSeleccionadaId } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { formatHoraRange, ONLY_HORA_FLAG, HORA_CONFIRM_YES_ID, HORA_CONFIRM_NO_ID } from "@/lib/fsm/flows/cita/steps/hora/format";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export function askHoraConfirmation(session: Session, slotId: string, options: { only?: boolean } = {}): HandlerResult {
  const [start, end] = slotId.split("|");
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_HORA_CONFIRM;
  next.slots[SlotKey.CITA_HORA_CONFIRM_ID] = slotId;
  if (options.only) next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY] = ONLY_HORA_FLAG;
  else delete next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY];

  const range = formatHoraRange(start, end);
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
  delete next.slots[SlotKey.CITA_HORAS_DIA];
  delete next.slots[SlotKey.CITA_HORA_CONFIRM_ID];
  delete next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY];
  delete next.slots[SlotKey.CITA_HORA_CHOICE_A];
  delete next.slots[SlotKey.CITA_HORA_CHOICE_B];
  next.state = SessionState.CITA_BOOKING_PENDING;
  const referenciaId = referenciaSeleccionadaId(next.slots);
  return buildResult(next, [
    sendText("Agendando tu cita…"),
    query(QueryKind.BOOK_APPOINTMENT, {
      codigoRenipress: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
      codigoUps: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
      fechaCita: String(next.slots[SlotKey.CITA_FECHA] ?? ""),
      horaInicio,
      numeroDocumentoPaciente: String(next.slots[SlotKey.CITA_DNI] ?? ""),
      ...(referenciaId ? { referenciaId } : {}),
    }),
  ]);
}
