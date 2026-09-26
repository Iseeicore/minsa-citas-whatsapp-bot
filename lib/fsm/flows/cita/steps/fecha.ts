import { searchFailureText } from "@/lib/fsm/core/failure-texts";
import { closeWithApology, discardedDates } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { normalizeText } from "@/lib/fsm/parsing/text";
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
import { formatDateLong, formatDateShort, matchFechaText, parseOfferedDate } from "@/lib/fsm/parsing/date-parser";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, SELECTION_REJECTION, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/selection";
import { todayInLima } from "@/lib/time/lima-clock";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";

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
    return beginReverification(next, "cita_fecha_pending");
  }

  if (result.status === "error") {
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        searchFailureText("fechas"),
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
    return buildResult(next, offerPagedList(next, "Selecciona la fecha:", rows));
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [sendText("No hay fechas disponibles para ese establecimiento.")]);
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
