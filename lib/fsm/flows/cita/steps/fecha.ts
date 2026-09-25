import { closeWithApology, discardedDates } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { normalizeText } from "@/lib/fsm/parsing/text";
import {
  buildResult,
  cloneSession,
  offerList,
  query,
  sendText,
  truncateForRow,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa";
import { formatDateLong, formatDateShort, matchFechaText, parseOfferedDate } from "@/lib/fsm/parsing/date-parser";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, SELECTION_REJECTION, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/selection";
import { todayInLima } from "@/lib/fsm/flows/cita/lima-clock";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";

// ---- Fecha -----------------------------------------------------------

type FechaResultItem = {
  fechaCupo: string;
  cantidadCupos: number;
};

// What the citizen reads instead of MINSA's raw fechaCupo ("22/09/2026") or the
// fake catalog's ("20260920", no separators at all). Never changes `fechaCupo`
// itself — that keeps traveling as-is in `citaFecha` and, at the query-execution
// boundary (executor.ts), through formatFechaForApi before it reaches MINSA. A
// fechaCupo in a format parseOfferedDate does not recognize falls back to the
// raw string, so a row never breaks over a display nicety.
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
    return beginReverification(next, "cita_fecha_pending");
  }

  if (result.status === "error") {
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar fechas disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  // The dates the citizen already turned down (the only horario of the day was
  // not what they wanted) are never offered again. Compared by the real day
  // (normalized to YYYYMMDD), not by the exact string: MINSA's format could
  // change between two queries and a raw comparison would miss the match,
  // offering a declined date again.
  const discarded = discardedDates(next.slots).map(formatFechaForApi);
  const dates = (result.status === "found" ? (result.items ?? []) : []).filter(
    (item) => !discarded.includes(formatFechaForApi(item.fechaCupo)),
  );
  if (discarded.length > 0 && dates.length === 0) return closeWithApology("no_other_dates");

  if (dates.length === 1) {
    const [item] = dates;
    next.slots.citaFecha = item.fechaCupo;
    next.state = "cita_hora_pending";
    return buildResult(next, [
      sendText(`Fecha encontrada: ${displayFechaLong(item.fechaCupo)}. Buscando horarios disponibles…`),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: item.fechaCupo,
      }),
    ]);
  }

  if (dates.length > 1) {
    next.state = "cita_awaiting_fecha_select";
    const rows: ListRow[] = dates.map((item) => ({
      id: item.fechaCupo,
      title: truncateForRow(displayFechaShort(item.fechaCupo), WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona la fecha:", rows)]);
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [sendText("No hay fechas disponibles para ese establecimiento.")]);
}

// Only phrases that actually talk about time are worth an AI call — "asdf"
// or a pasted id must not cost one.
const TEMPORAL_PHRASE =
  /\b(semana|mes|proxim[oa]s?|siguiente|dias?|fin|final|inicio|principios?|quincena|luego|despues|pronto|temprano|urgente|antes|cuando|fecha)\b/;

function askFechaAi(session: Session, typed: string): HandlerResult | undefined {
  if (!TEMPORAL_PHRASE.test(normalizeText(typed).toLowerCase())) return undefined;

  const offered = readOffered(session.slots);
  if (!offered) return undefined;

  const today = todayInLima();
  const pad = (value: number) => String(value).padStart(2, "0");

  const next = cloneSession(session);
  next.state = "cita_fecha_ai_pending";
  return buildResult(next, [
    sendText("Un momento, estamos revisando tu respuesta…"),
    query("resolve_fecha_ai", {
      text: typed,
      today: `${today.year}-${pad(today.month)}-${pad(today.day)}`,
      options: offered.rows.map((row) => ({ id: row.id, label: row.title })),
    }),
  ]);
}

// The AI only ever picks one of the dates already offered; anything else (or
// no answer at all) goes back to the list. A valid pick is handled exactly
// like the citizen tapping that row.
export function handleFechaAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { id?: unknown };
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  restored.state = "cita_awaiting_fecha_select";

  if (typeof result.id === "string" && offered?.rows.some((row) => row.id === result.id)) {
    return handleAwaitingFechaSelect(restored, { from: event.from, type: "list", listId: result.id });
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
  next.slots.citaFecha = replyId;
  next.state = "cita_hora_pending";
  return buildResult(next, [
    sendText("Buscando horarios disponibles…"),
    query("list_horas", {
      codEess: String(next.slots.citaCodEess ?? ""),
      especialidadId: String(next.slots.citaEspecialidadId ?? ""),
      fecha: replyId,
    }),
  ]);
}
