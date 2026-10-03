/** DEMO PILOTO: borrar junto con su importador al cerrar la fase piloto. */
import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
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
import { clearOffered, resolveSelection } from "@/lib/fsm/flows/cita/selection";
import {
  DEMO_HORA_FIN,
  DEMO_HORA_INICIO,
  DEMO_REFERENCIAS,
  demoHoraSlots,
  demoReferenciasForDni,
} from "@/lib/fsm/flows/cita/steps/demo/demo-referencia";
import { formatHoraRange, slotToRow } from "@/lib/fsm/flows/cita/steps/hora/format";
import type { HandlerResult, InboundEvent, ListRow, Session } from "@/lib/fsm/core/types";

const DEMO_ANALYZING_TEXT = "Un momento, estamos analizando tu cuenta… cuenta con referencias:";
const DEMO_CONFIRM_YES_ID = "cita_demo_confirm_si";
const DEMO_CONFIRM_NO_ID = "cita_demo_confirm_no";

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
  next.state = "cita_demo_awaiting_referencia_select";
  delete next.slots.citaDemoReferenciaCodigo;
  delete next.slots.citaDemoHoraId;
  const dni = String(next.slots.citaDni ?? "");
  return buildResult(next, offerPagedList(next, DEMO_ANALYZING_TEXT, referenciaRows(dni)));
}

function offerDemoHoras(session: Session, codigo: string): HandlerResult {
  const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
  const next = cloneSession(session);
  next.slots.citaDemoReferenciaCodigo = codigo;
  next.state = "cita_demo_awaiting_hora_select";
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
  const codigo = String(next.slots.citaDemoReferenciaCodigo ?? "");
  next.slots.citaDemoHoraId = outcome.replyId;
  next.state = "cita_demo_awaiting_confirm";
  return askDemoConfirmation(next, codigo, outcome.replyId);
}

export function handleDemoAwaitingConfirm(session: Session, event: InboundEvent): HandlerResult {
  const codigo = String(session.slots.citaDemoReferenciaCodigo ?? "");
  const horaId = String(session.slots.citaDemoHoraId ?? "");
  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? resolveConfirmation(event.text ?? "") : "UNKNOWN";

  if (reply === DEMO_CONFIRM_YES_ID || typed === "YES") {
    const referencia = DEMO_REFERENCIAS.find((item) => item.codigo === codigo);
    const [start, end] = horaId.split("|");
    const turno =
      /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "") ? formatHoraRange(start, end) : horaId;
    const next = cloneSession(session);
    next.state = "cita_booked";
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
Establecimiento: ${referencia?.hospital ?? ""}
Especialidad: ${referencia?.especialidad ?? ""}
Turno: ${turno}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [sendText(constanciaText), sendText(DESPEDIDA_TEXT)]);
  }

  if (reply === DEMO_CONFIRM_NO_ID || typed === "NO") {
    const next = cloneSession(session);
    delete next.slots.citaDemoHoraId;
    return offerDemoHoras(next, codigo);
  }

  return askDemoConfirmation(session, codigo, horaId);
}
