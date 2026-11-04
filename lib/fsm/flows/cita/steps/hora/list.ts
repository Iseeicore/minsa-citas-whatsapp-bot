import { SearchSubject } from "@/lib/enums/search-subject";
import { OfferOtherFechaReason } from "@/lib/enums/offer-other-fecha-reason";
import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import {
  buildResult,
  cloneSession,
  listPageSize,
  offerList,
  sendButtons,
  truncateForRow,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { packHoraSlots } from "@/lib/fsm/parsing/date/time-parser";
import type { HandlerResult, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { type HoraResultItem, formatHoraRange, orderHorasFromNow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { askHoraConfirmation } from "@/lib/fsm/flows/cita/steps/hora/ask-or-book";
import { isReferenceAppointment } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { restartReferenceSelection } from "@/lib/fsm/flows/cita/steps/booking/references";
import { searchFailureGate } from "@/lib/fsm/flows/cita/steps/catalog/search-failure-gate";
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
import { HoraPageButtonId } from "@/lib/enums/botones/hora-page-button-id";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

function horaFailureGate(session: Session, status: string): HandlerResult | undefined {
  if (isReferenceAppointment(session) && status === CatalogStatus.ERROR) {
    return withLeadingText(restartReferenceSelection(session), searchFailureText(SearchSubject.HORARIOS));
  }
  return searchFailureGate(cloneSession(session), status, SessionState.CITA_HORA_PENDING, SearchSubject.HORARIOS);
}

function availableHoras(session: Session, items: HoraResultItem[]): HoraResultItem[] {
  const candidates = isReferenceAppointment(session) ? items.filter((item) => item.cantidadCupos > 0) : items;
  return orderHorasFromNow(slotText(session.slots, SlotKey.CITA_FECHA), candidates);
}

function horaRow(item: HoraResultItem): ListRow {
  return {
    id: `${item.horaInicio}|${item.horaFin}`,
    title: truncateForRow(formatHoraRange(item.horaInicio, item.horaFin), WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(cuposDisponiblesText(item.cantidadCupos), WHATSAPP_ROW_DESCRIPTION_MAX),
  };
}

function resolveSingleOrNoHora(session: Session, items: HoraResultItem[]): HandlerResult {
  const next = cloneSession(session);
  const [item] = items;
  if (item) return askHoraConfirmation(next, `${item.horaInicio}|${item.horaFin}`, { only: true });
  return offerOtherFecha(next, OfferOtherFechaReason.NO_HORARIOS);
}

function buildHoraPage(session: Session, orderedItems: HoraResultItem[], page: number): HandlerResult {
  if (orderedItems.length <= 1) return resolveSingleOrNoHora(session, orderedItems);

  const size = listPageSize(session);
  const current = Math.min(page, Math.ceil(orderedItems.length / size) - 1);
  const start = current * size;

  const next = cloneSession(session);
  next.state = SessionState.CITA_AWAITING_HORA_SELECT;
  next.slots[SlotKey.CITA_HORAS_DIA] = packHoraSlots(
    orderedItems.map((item) => ({ start: item.horaInicio, end: item.horaFin, cupos: item.cantidadCupos })),
  );
  const effects = [offerList(next, SELECT_HORA_TEXT, orderedItems.slice(start, start + size).map(horaRow))];

  const hasNext = start + size < orderedItems.length;
  const hasPrev = current > 0;
  if (hasNext || hasPrev) {
    next.counters[CounterKey.CITA_HORA_PAGE] = current;
    effects.push(
      sendButtons(HORA_PAGE_QUESTION_TEXT, [
        ...(hasPrev ? [{ id: HoraPageButtonId.PREV, title: HORA_PAGE_PREV_BUTTON_TEXT }] : []),
        ...(hasNext ? [{ id: HoraPageButtonId.NEXT, title: HORA_PAGE_NEXT_BUTTON_TEXT }] : []),
      ]),
    );
  }
  return buildResult(next, effects);
}

export function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  const failure = horaFailureGate(session, result.status);
  if (failure) return failure;
  const ordered = availableHoras(session, result.items ?? []);
  return buildHoraPage(session, ordered, 0);
}

export function handleHoraPagePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  const failure = horaFailureGate(session, result.status);
  if (failure) return failure;
  const ordered = availableHoras(session, result.items ?? []);
  const page = session.counters[CounterKey.CITA_HORA_PAGE] ?? 0;
  return buildHoraPage(session, ordered, page);
}
