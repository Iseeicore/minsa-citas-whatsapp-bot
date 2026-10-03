import { searchFailureText } from "@/lib/fsm/core/failure-texts";
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
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import { formatDateLong, formatDateShort, matchFechaText, parseOfferedDate } from "@/lib/fsm/parsing/date/date-parser";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, SELECTION_REJECTION, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { todayInLima } from "@/lib/time/lima-clock";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { searchOtherEstablecimiento } from "@/lib/fsm/flows/cita/steps/catalog/other-establecimiento";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

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

  if (result.status === "unauthorized") {
    return beginReverification(next, SessionState.CITA_FECHA_PENDING);
  }

  if (result.status === "error") {
    next.state = SessionState.CITA_BOOKING_REJECTED;
    return buildResult(next, [
      sendText(
        searchFailureText(SearchSubject.FECHAS),
      ),
    ]);
  }

  const discarded = discardedDates(next.slots).map(formatFechaForApi);
  const dates = (result.status === "found" ? (result.items ?? []) : []).filter(
    (item) => !discarded.includes(formatFechaForApi(item.fechaCupo)),
  );
  if (discarded.length > 0 && dates.length === 0) return closeWithApology("no_other_dates");

  if (dates.length === 1) {
    const [item] = dates;
    next.slots[SlotKey.CITA_FECHA] = item.fechaCupo;
    next.state = SessionState.CITA_HORA_PENDING;
    return buildResult(next, [
      sendText(`Fecha encontrada: ${displayFechaLong(item.fechaCupo)}. Buscando horarios disponibles…`),
      query(QueryKind.LIST_HORAS, {
        codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
        especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
        fecha: item.fechaCupo,
      }),
    ]);
  }

  if (dates.length > 1) {
    next.state = SessionState.CITA_AWAITING_FECHA_SELECT;
    const rows: ListRow[] = dates.map((item) => ({
      id: item.fechaCupo,
      title: truncateForRow(displayFechaShort(item.fechaCupo), WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, offerPagedList(next, "Selecciona la fecha:", rows));
  }

  return searchOtherEstablecimiento(next);
}

const TEMPORAL_PHRASE =
  /\b(semana|mes|proxim[oa]s?|siguiente|dias?|fin|final|inicio|principios?|quincena|luego|despues|pronto|temprano|urgente|antes|cuando|fecha)\b/;

function askFechaAi(session: Session, typed: string): HandlerResult | undefined {
  if (!TEMPORAL_PHRASE.test(normalizeText(typed).toLowerCase())) return undefined;

  const offered = readOffered(session.slots);
  if (!offered) return undefined;

  const today = todayInLima();
  const pad = (value: number) => String(value).padStart(2, "0");

  const next = cloneSession(session);
  next.state = SessionState.CITA_FECHA_AI_PENDING;
  return buildResult(next, [
    sendText("Un momento, estamos revisando tu respuesta…"),
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

  if (typeof result.id === "string" && offered?.rows.some((row) => row.id === result.id)) {
    return handleAwaitingFechaSelect(restored, { from: event.from, type: InboundEventType.LIST, listId: result.id });
  }

  return reshowOffered(restored, offered, `No pudimos identificar esa fecha. ${SELECTION_REJECTION}`);
}

export function handleAwaitingFechaSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    customMatch: (typed, rows) => {
      const parsed = matchFechaText(typed, rows, todayInLima());
      if (parsed.kind === "unparsed") return undefined;
      if (parsed.kind === "unavailable") {
        return { kind: "notice", text: `No hay cupos para ${parsed.label}. Elige una de las fechas disponibles:` };
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
    sendText("Buscando horarios disponibles…"),
    query(QueryKind.LIST_HORAS, {
      codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
      especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
      fecha: replyId,
    }),
  ]);
}
