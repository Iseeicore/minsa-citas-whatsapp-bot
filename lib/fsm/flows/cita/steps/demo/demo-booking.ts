import { CLOCK_TIME } from "@/lib/constants/regex/text";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  sendButtons,
  sendText,
  truncateForRow,
  readTappedId,
} from "@/lib/fsm/core/handlers-shared";
import { clearOffered, resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import {
  DEMO_HORA_FIN,
  DEMO_HORA_INICIO,
  DEMO_REFERENCIAS,
  demoHoraSlots,
  demoReferenciasForDni,
} from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import { formatHoraRange, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";
import type { HandlerResult, InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";
import { DemoConfirmButtonId } from "@/lib/enums/demo-confirm-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { CITA_BOOKED_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";
import {
  DEMO_HORAS_LIST_TEXT,
  DEMO_CONFIRM_QUESTION_TEXT,
  DEMO_ANALYZING_TEXT,
  demoHorasIntroText,
  demoResumenText,
  demoConstanciaDetalleText,
  DEMO_CONFIRM_BUTTONS,
} from "@/lib/constants/textos/cita-demo";
import { constanciaCitaText } from "@/lib/constants/textos/cita-reserva";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

function referenciaRows(dni: string): ListRow[] {
  return demoReferenciasForDni(dni).map((referencia) => ({
    id: referencia.codigo,
    title: truncateForRow(referencia.hospital, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${referencia.red} · ${referencia.ris} · ${referencia.distrito}`, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
}

export function offerDemoReferencias(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_DEMO_AWAITING_REFERENCIA_SELECT;
  delete next.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO];
  delete next.slots[SlotKey.CITA_DEMO_HORA_ID];
  const dni = slotText(next.slots, SlotKey.CITA_DNI);
  return buildResult(next, offerPagedList(next, DEMO_ANALYZING_TEXT, referenciaRows(dni)));
}

function offerDemoHoras(session: Session, codigo: string): HandlerResult {
  const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO] = codigo;
  next.state = SessionState.CITA_DEMO_AWAITING_HORA_SELECT;
  const intro = demoHorasIntroText(referencia?.hospital ?? "", referencia?.especialidad ?? "", DEMO_HORA_INICIO, DEMO_HORA_FIN);
  const rows = demoHoraSlots().map(slotToRow);
  return buildResult(next, [sendText(intro), ...offerPagedList(next, DEMO_HORAS_LIST_TEXT, rows)]);
}

function askDemoConfirmation(session: Session, codigo: string, horaId: string): HandlerResult {
  const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
  const [start, end] = horaId.split("|");
  const turno = CLOCK_TIME.test(start ?? "") && CLOCK_TIME.test(end ?? "") ? formatHoraRange(start, end) : horaId;
  const resumen = demoResumenText(referencia?.especialidad ?? "", turno);
  return buildResult(session, [sendText(resumen), sendButtons(DEMO_CONFIRM_QUESTION_TEXT, DEMO_CONFIRM_BUTTONS)]);
}

export function handleDemoAwaitingReferenciaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if ("result" in outcome) return outcome.result;

  const next = clearOffered(session);
  return offerDemoHoras(next, outcome.replyId);
}

export function handleDemoAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if ("result" in outcome) return outcome.result;

  const next = clearOffered(session);
  const codigo = slotText(next.slots, SlotKey.CITA_DEMO_REFERENCIA_CODIGO);
  next.slots[SlotKey.CITA_DEMO_HORA_ID] = outcome.replyId;
  next.state = SessionState.CITA_DEMO_AWAITING_CONFIRM;
  return askDemoConfirmation(next, codigo, outcome.replyId);
}

export function handleDemoAwaitingConfirm(session: Session, event: InboundEvent): HandlerResult {
  const codigo = slotText(session.slots, SlotKey.CITA_DEMO_REFERENCIA_CODIGO);
  const horaId = slotText(session.slots, SlotKey.CITA_DEMO_HORA_ID);
  const reply = readTappedId(event);
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === DemoConfirmButtonId.YES || typed === Confirmation.YES) {
    const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
    const [start, end] = horaId.split("|");
    const turno = CLOCK_TIME.test(start ?? "") && CLOCK_TIME.test(end ?? "") ? formatHoraRange(start, end) : horaId;
    const next = cloneSession(session);
    next.state = SessionState.CITA_BOOKED;
    const constanciaText = constanciaCitaText(demoConstanciaDetalleText(referencia?.hospital ?? "", referencia?.especialidad ?? "", turno));
    return buildResult(next, [sendText(constanciaText), sendText(CITA_BOOKED_FAREWELL_TEXT)]);
  }

  if (reply === DemoConfirmButtonId.NO || typed === Confirmation.NO) {
    const next = cloneSession(session);
    delete next.slots[SlotKey.CITA_DEMO_HORA_ID];
    return offerDemoHoras(next, codigo);
  }

  return askDemoConfirmation(session, codigo, horaId);
}
