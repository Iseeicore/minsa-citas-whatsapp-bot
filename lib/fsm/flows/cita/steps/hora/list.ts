import { searchFailureText } from "@/lib/fsm/core/failure-texts";
import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { buildResult, cloneSession, offerList, sendText, sendButtons, truncateForRow, WHATSAPP_LIST_MAX_ROWS, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/fsm/core/handlers-shared";
import { packHoraSlots } from "@/lib/fsm/parsing/time-parser";
import type { HandlerResult, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { type HoraResultItem, formatHora12, HORA_PAGE_PREV_ID, HORA_PAGE_NEXT_ID, orderHorasFromNow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";
import { askHoraConfirmation } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";

function resolveHoraCandidates(session: Session, items: HoraResultItem[]): HandlerResult {
  const next = cloneSession(session);

  if (items.length === 1) {
    const [item] = items;
    return askHoraConfirmation(next, `${item.horaInicio}|${item.horaFin}`, { only: true });
  }

  if (items.length > 1) {
    next.state = "cita_awaiting_hora_select";
    const rows: ListRow[] = items.map((item) => ({
      id: `${item.horaInicio}|${item.horaFin}`,
      title: truncateForRow(`${formatHora12(item.horaInicio)} - ${formatHora12(item.horaFin)}`, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona el horario:", rows)]);
  }

  return offerOtherFecha(next, "no_horarios");
}

function buildHoraPage(session: Session, orderedItems: HoraResultItem[], page: number): HandlerResult {
  const start = page * WHATSAPP_LIST_MAX_ROWS;
  const pageItems = orderedItems.slice(start, start + WHATSAPP_LIST_MAX_ROWS);

  const result = resolveHoraCandidates(session, pageItems);
  if (pageItems.length <= 1) return result;

  result.session.slots.citaHorasDia = packHoraSlots(
    orderedItems.map((item) => ({ start: item.horaInicio, end: item.horaFin, cupos: item.cantidadCupos })),
  );

  const hasNext = start + WHATSAPP_LIST_MAX_ROWS < orderedItems.length;
  const hasPrev = page > 0;
  if (!hasNext && !hasPrev) return result;

  result.session.counters.citaHoraPage = page;
  const navButtons = [
    ...(hasPrev ? [{ id: HORA_PAGE_PREV_ID, title: "Horarios anteriores" }] : []),
    ...(hasNext ? [{ id: HORA_PAGE_NEXT_ID, title: "Ver más horarios" }] : []),
  ];
  result.effects.push(sendButtons("¿Quieres ver otros horarios de esta especialidad?", navButtons));
  return result;
}

export function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        searchFailureText("horarios"),
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  return buildHoraPage(session, ordered, 0);
}

export function handleHoraPagePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        searchFailureText("horarios"),
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  const page = session.counters.citaHoraPage ?? 0;
  return buildHoraPage(session, ordered, page);
}
