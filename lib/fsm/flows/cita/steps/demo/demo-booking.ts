/** DEMO PILOTO: borrar junto con su importador al cerrar la fase piloto. */
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  sendButtons,
  sendText,
  truncateForRow,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
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

const DEMO_ANALYZING_TEXT = "Un momento, estamos analizando tu cuenta… cuenta con referencias:";
const DEMO_CONFIRM_YES_ID = DemoConfirmButtonId.YES;
const DEMO_CONFIRM_NO_ID = DemoConfirmButtonId.NO;

const DESPEDIDA_TEXT =
  "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋";

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
  const dni = String(next.slots[SlotKey.CITA_DNI] ?? "");
  return buildResult(next, offerPagedList(next, DEMO_ANALYZING_TEXT, referenciaRows(dni)));
}

function offerDemoHoras(session: Session, codigo: string): HandlerResult {
  const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO] = codigo;
  next.state = SessionState.CITA_DEMO_AWAITING_HORA_SELECT;
  const intro = `Listo, el establecimiento *${referencia?.hospital ?? ""}* cuenta con una referencia para ti.

Especialidad: ${referencia?.especialidad ?? ""}
Horario de atención: ${DEMO_HORA_INICIO} - ${DEMO_HORA_FIN} (turnos de 25 minutos)

¿A qué hora deseas tu cita? Elige un horario:`;
  const rows = demoHoraSlots().map(slotToRow);
  return buildResult(next, [sendText(intro), ...offerPagedList(next, "Horarios disponibles:", rows)]);
}

function askDemoConfirmation(session: Session, codigo: string, horaId: string): HandlerResult {
  const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
  const [start, end] = horaId.split("|");
  const turno = /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "") ? formatHoraRange(start, end) : horaId;
  const resumen = `Especialidad: ${referencia?.especialidad ?? ""}
Turno seleccionado: ${turno}

¿Confirmas tu cita?`;
  return buildResult(session, [
    sendText(resumen),
    sendButtons("¿Confirmas tu cita?", [
      { id: DEMO_CONFIRM_YES_ID, title: "Sí, confirmar" },
      { id: DEMO_CONFIRM_NO_ID, title: "No, elegir otra" },
    ]),
  ]);
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
  const codigo = String(next.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO] ?? "");
  next.slots[SlotKey.CITA_DEMO_HORA_ID] = outcome.replyId;
  next.state = SessionState.CITA_DEMO_AWAITING_CONFIRM;
  return askDemoConfirmation(next, codigo, outcome.replyId);
}

export function handleDemoAwaitingConfirm(session: Session, event: InboundEvent): HandlerResult {
  const codigo = String(session.slots[SlotKey.CITA_DEMO_REFERENCIA_CODIGO] ?? "");
  const horaId = String(session.slots[SlotKey.CITA_DEMO_HORA_ID] ?? "");
  const reply =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? resolveConfirmation(event.text ?? "") : Confirmation.UNKNOWN;

  if (reply === DEMO_CONFIRM_YES_ID || typed === Confirmation.YES) {
    const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
    const [start, end] = horaId.split("|");
    const turno =
      /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "") ? formatHoraRange(start, end) : horaId;
    const next = cloneSession(session);
    next.state = SessionState.CITA_BOOKED;
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
Establecimiento: ${referencia?.hospital ?? ""}
Especialidad: ${referencia?.especialidad ?? ""}
Turno: ${turno}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [sendText(constanciaText), sendText(DESPEDIDA_TEXT)]);
  }

  if (reply === DEMO_CONFIRM_NO_ID || typed === Confirmation.NO) {
    const next = cloneSession(session);
    delete next.slots[SlotKey.CITA_DEMO_HORA_ID];
    return offerDemoHoras(next, codigo);
  }

  return askDemoConfirmation(session, codigo, horaId);
}
