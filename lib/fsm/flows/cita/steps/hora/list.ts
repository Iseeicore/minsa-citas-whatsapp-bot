import { SearchSubject } from "@/lib/enums/search-subject";
import { OfferOtherFechaReason } from "@/lib/enums/offer-other-fecha-reason";
import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { buildResult, cloneSession, offerList, sendText, sendButtons, truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { packHoraSlots } from "@/lib/fsm/parsing/date/time-parser";
import type { HandlerResult, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { type HoraResultItem, formatHoraRange, orderHorasFromNow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { askHoraConfirmation } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  cuposDisponiblesText,
  SELECT_HORA_TEXT,
  HORA_PAGE_PREV_BUTTON_TEXT,
  HORA_PAGE_NEXT_BUTTON_TEXT,
  HORA_PAGE_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-fecha-hora";
import { searchFailureText } from "@/lib/constants/textos/fallas";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_LIST_MAX_ROWS } from "@/lib/constants/limits/whatsapp";

function resolveHoraCandidates(session: Session, items: HoraResultItem[]): HandlerResult {
  const next = cloneSession(session);

  if (items.length === 1) {
    const [item] = items;
    return askHoraConfirmation(next, `${item.horaInicio}|${item.horaFin}`, { only: true });
  }

  if (items.length > 1) {
    next.state = SessionState.CITA_AWAITING_HORA_SELECT;
    const rows: ListRow[] = items.map((item) => ({
      id: `${item.horaInicio}|${item.horaFin}`,
      title: truncateForRow(formatHoraRange(item.horaInicio, item.horaFin), WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(cuposDisponiblesText(item.cantidadCupos), WHATSAPP_ROW_DESCRIPTION_MAX),
    }));
    return buildResult(next, [offerList(next, SELECT_HORA_TEXT, rows)]);
  }

  return offerOtherFecha(next, OfferOtherFechaReason.NO_HORARIOS);
}

function buildHoraPage(session: Session, orderedItems: HoraResultItem[], page: number): HandlerResult {
  const start = page * WHATSAPP_LIST_MAX_ROWS;
  const pageItems = orderedItems.slice(start, start + WHATSAPP_LIST_MAX_ROWS);

  const result = resolveHoraCandidates(session, pageItems);
  if (pageItems.length <= 1) return result;

  result.session.slots[SlotKey.CITA_HORAS_DIA] = packHoraSlots(
    orderedItems.map((item) => ({ start: item.horaInicio, end: item.horaFin, cupos: item.cantidadCupos })),
  );

  const hasNext = start + WHATSAPP_LIST_MAX_ROWS < orderedItems.length;
  const hasPrev = page > 0;
  if (!hasNext && !hasPrev) return result;

  result.session.counters[CounterKey.CITA_HORA_PAGE] = page;
  const navButtons = [
    ...(hasPrev ? [{ id: HoraPageButtonId.PREV, title: HORA_PAGE_PREV_BUTTON_TEXT }] : []),
    ...(hasNext ? [{ id: HoraPageButtonId.NEXT, title: HORA_PAGE_NEXT_BUTTON_TEXT }] : []),
  ];
  result.effects.push(sendButtons(HORA_PAGE_QUESTION_TEXT, navButtons));
  return result;
}

export function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === CatalogStatus.UNAUTHORIZED) {
    return beginReverification(session, SessionState.CITA_HORA_PENDING);
  }

  if (result.status === CatalogStatus.ERROR) {
    const next = cloneSession(session);
    next.state = SessionState.CITA_BOOKING_REJECTED;
    return buildResult(next, [sendText(searchFailureText(SearchSubject.HORARIOS))]);
  }

  const ordered = orderHorasFromNow(slotText(session.slots, SlotKey.CITA_FECHA), result.items ?? []);
  return buildHoraPage(session, ordered, 0);
}

export function handleHoraPagePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === CatalogStatus.UNAUTHORIZED) {
    return beginReverification(session, SessionState.CITA_HORA_PENDING);
  }

  if (result.status === CatalogStatus.ERROR) {
    const next = cloneSession(session);
    next.state = SessionState.CITA_BOOKING_REJECTED;
    return buildResult(next, [sendText(searchFailureText(SearchSubject.HORARIOS))]);
  }

  const ordered = orderHorasFromNow(slotText(session.slots, SlotKey.CITA_FECHA), result.items ?? []);
  const page = session.counters[CounterKey.CITA_HORA_PAGE] ?? 0;
  return buildHoraPage(session, ordered, page);
}
