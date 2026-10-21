import { SearchSubject } from "@/lib/enums/search-subject";
import { QueryKind } from "@/lib/enums/query-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { closeWithApology, discardedDates } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendText,
  truncateForRow,
  withLeadingText,
} from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import { formatDateLong, formatDateShort, matchFechaText, parseOfferedDate } from "@/lib/fsm/parsing/date/date-parser";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { todayInLima } from "@/lib/time/lima-clock";
import { searchFailureGate } from "@/lib/fsm/flows/cita/steps/catalog/search-failure-gate";
import { searchOtherEstablecimiento } from "@/lib/fsm/flows/cita/steps/catalog/other-establecimiento";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { isReferenceAppointment, referenciaSeleccionadaId } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { restartReferenceSelection } from "@/lib/fsm/flows/cita/steps/booking/references";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { TEMPORAL_PHRASE } from "@/lib/constants/regex/date-time";
import { REVIEWING_ANSWER_TEXT } from "@/lib/constants/textos/comunes";
import { askOtherReference } from "@/lib/fsm/flows/referencia/other-reference";
import { searchFailureText } from "@/lib/constants/textos/fallas";
import {
  SEARCHING_HORARIOS_TEXT,
  fechaFoundText,
  FECHA_NOT_IDENTIFIED_TEXT,
  cuposDisponiblesText,
  noCuposForFechaText,
  SELECT_FECHA_TEXT,
} from "@/lib/constants/textos/cita-fecha-hora";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { MatchKind } from "@/lib/enums/match-kind";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { isString } from "@/lib/utils/type-guards";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

type FechaResultItem = {
  fechaCupo: string;
  cantidadCupos: number;
};

function displayFechaLong(fechaCupo: string): string {
  const parsed = parseOfferedDate(fechaCupo);
  return parsed ? formatDateLong(parsed) : fechaCupo;
}

function displayFechaShort(fechaCupo: string): string {
  const parsed = parseOfferedDate(fechaCupo);
  return parsed ? formatDateShort(parsed) : fechaCupo;
}

export function handleFechaPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: FechaResultItem[] };
  const next = cloneSession(session);
  const referenceAppointment = isReferenceAppointment(next);
  if (referenceAppointment && result.status === CatalogStatus.ERROR) {
    return withLeadingText(restartReferenceSelection(next), searchFailureText(SearchSubject.FECHAS));
  }

  const failure = searchFailureGate(next, result.status, SessionState.CITA_FECHA_PENDING, SearchSubject.FECHAS);
  if (failure) return failure;

  const discarded = discardedDates(next.slots).map(formatFechaForApi);
  const dates = (result.status === CatalogStatus.FOUND ? (result.items ?? []) : []).filter(
    (item) => !discarded.includes(formatFechaForApi(item.fechaCupo)) && (!referenceAppointment || item.cantidadCupos > 0),
  );
  if (referenceAppointment && dates.length === 0) return askOtherReference(next);
  if (discarded.length > 0 && dates.length === 0) return closeWithApology("no_other_dates");

  if (dates.length === 1) {
    const [item] = dates;
    next.slots[SlotKey.CITA_FECHA] = item.fechaCupo;
    next.state = SessionState.CITA_HORA_PENDING;
    return buildResult(next, [
      sendText(fechaFoundText(displayFechaLong(item.fechaCupo))),
      query(QueryKind.LIST_HORAS, {
        codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
        especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
        fecha: item.fechaCupo,
      }),
    ]);
  }

  if (dates.length > 1) {
    next.state = SessionState.CITA_AWAITING_FECHA_SELECT;
    const rows: ListRow[] = dates.map((item) => ({
      id: item.fechaCupo,
      title: truncateForRow(displayFechaShort(item.fechaCupo), WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(cuposDisponiblesText(item.cantidadCupos), WHATSAPP_ROW_DESCRIPTION_MAX),
    }));
    return buildResult(next, offerPagedList(next, SELECT_FECHA_TEXT, rows));
  }

  if (referenciaSeleccionadaId(next.slots)) return closeWithApology("referencia_sin_cupos");

  return searchOtherEstablecimiento(next);
}

function askFechaAi(session: Session, typed: string): HandlerResult | undefined {
  if (!TEMPORAL_PHRASE.test(normalizeText(typed).toLowerCase())) return undefined;

  const offered = readOffered(session.slots);
  if (!offered) return undefined;

  const today = todayInLima();
  const pad = (value: number) => String(value).padStart(2, "0");

  const next = cloneSession(session);
  next.state = SessionState.CITA_FECHA_AI_PENDING;
  return buildResult(next, [
    sendText(REVIEWING_ANSWER_TEXT),
    query(QueryKind.RESOLVE_FECHA_AI, {
      text: typed,
      today: `${today.year}-${pad(today.month)}-${pad(today.day)}`,
      options: offered.rows.map((row) => ({ id: row.id, label: row.title })),
    }),
  ]);
}

export function handleFechaAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { id?: unknown; quiereSalir?: boolean };
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  restored.state = SessionState.CITA_AWAITING_FECHA_SELECT;

  if (result.quiereSalir === true) return askToLeave(restored, "ai");

  if (isString(result.id) && offered?.rows.some((row) => row.id === result.id)) {
    return handleAwaitingFechaSelect(restored, { from: event.from, type: InboundEventType.LIST, listId: result.id });
  }

  return reshowOffered(restored, offered, FECHA_NOT_IDENTIFIED_TEXT);
}

export function handleAwaitingFechaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    customMatch: (typed, rows) => {
      const parsed = matchFechaText(typed, rows, todayInLima());
      if (parsed.kind === MatchKind.UNPARSED) return undefined;
      if (parsed.kind === MatchKind.UNAVAILABLE) {
        return { kind: MatchKind.NOTICE, text: noCuposForFechaText(parsed.label) };
      }
      return parsed;
    },
    onNoMatchText: (typed) => askFechaAi(session, typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const next = clearOffered(session);
  next.slots[SlotKey.CITA_FECHA] = replyId;
  next.state = SessionState.CITA_HORA_PENDING;
  return buildResult(next, [
    sendText(SEARCHING_HORARIOS_TEXT),
    query(QueryKind.LIST_HORAS, {
      codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
      especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
      fecha: replyId,
    }),
  ]);
}
