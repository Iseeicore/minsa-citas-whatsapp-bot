import { buildResult, cloneSession, query, sendText, sendButtons } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, QueryEffect, Session } from "@/lib/fsm/core/types";
import { clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import {
  isReferenceAppointment,
  referenciaSeleccionada,
  referenciaSeleccionadaId,
} from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { formatHoraRange, ONLY_HORA_FLAG } from "@/lib/fsm/flows/cita/steps/hora/format";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  onlyHoraConfirmText,
  horaConfirmText,
  ONLY_HORA_CONFIRM_BUTTONS,
  HORA_CONFIRM_BUTTONS,
} from "@/lib/constants/textos/cita-fecha-hora";
import { referenciaReservaResumenText } from "@/lib/constants/textos/cita-reserva";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { formatDateLong, parseOfferedDate } from "@/lib/fsm/parsing/date/date-parser";

export function askHoraConfirmation(session: Session, slotId: string, options: { only?: boolean } = {}): HandlerResult {
  const [start, end] = slotId.split("|");
  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_HORA_CONFIRM;
  next.slots[SlotKey.CITA_HORA_CONFIRM_ID] = slotId;
  if (options.only) next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY] = ONLY_HORA_FLAG;
  else delete next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY];

  const range = formatHoraRange(start, end);
  const referencia = referenciaSeleccionada(next);
  const fecha = slotText(next.slots, SlotKey.CITA_FECHA);
  const fechaInterpretada = parseOfferedDate(fecha);
  return buildResult(next, [
    ...(isReferenceAppointment(next)
      ? [
          sendText(
            referenciaReservaResumenText(
              referencia?.numero ?? referenciaSeleccionadaId(next.slots) ?? "",
              slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_NOMBRE),
              slotText(next.slots, SlotKey.CITA_ESTABLECIMIENTO_NOMBRE),
              fechaInterpretada ? `${formatDateLong(fechaInterpretada)} (${fechaInterpretada.year})` : fecha,
              range,
            ),
          ),
        ]
      : []),
    options.only
      ? sendButtons(onlyHoraConfirmText(range), ONLY_HORA_CONFIRM_BUTTONS)
      : sendButtons(horaConfirmText(range), HORA_CONFIRM_BUTTONS),
  ]);
}

export function chooseHora(session: Session, slotId: string): HandlerResult {
  if (isReferenceAppointment(session)) return askHoraConfirmation(session, slotId);
  return startBooking(session, slotId.split("|")[0]);
}

export function startBooking(session: Session, horaInicio: string): HandlerResult {
  const next = clearOffered(session);
  delete next.slots[SlotKey.CITA_HORAS_DIA];
  delete next.slots[SlotKey.CITA_HORA_CONFIRM_ID];
  delete next.slots[SlotKey.CITA_HORA_CONFIRM_ONLY];
  delete next.slots[SlotKey.CITA_HORA_CHOICE_A];
  delete next.slots[SlotKey.CITA_HORA_CHOICE_B];
  delete next.counters[CounterKey.CITA_BOOKING_RETRIES];
  next.slots[SlotKey.CITA_HORA_RESERVA] = horaInicio;
  next.state = SessionState.CITA_BOOKING_PENDING;
  return buildResult(next, [bookingQuery(next)]);
}

export function bookingQuery(session: Session, extra: Record<string, unknown> = {}): QueryEffect {
  const referenciaId = referenciaSeleccionadaId(session.slots);
  return query(QueryKind.BOOK_APPOINTMENT, {
    codigoRenipress: slotText(session.slots, SlotKey.CITA_COD_EESS),
    codigoUps: slotText(session.slots, SlotKey.CITA_ESPECIALIDAD_ID),
    fechaCita: slotText(session.slots, SlotKey.CITA_FECHA),
    horaInicio: slotText(session.slots, SlotKey.CITA_HORA_RESERVA),
    numeroDocumentoPaciente: slotText(session.slots, SlotKey.CITA_DNI),
    ...(referenciaId ? { referenciaId } : {}),
    ...extra,
  });
}
