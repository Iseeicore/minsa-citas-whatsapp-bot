import { searchFailureText } from "@/lib/fsm/core/failure-texts";
import { offerOtherDistrito } from "@/lib/fsm/flows/cita/steps/no-coverage";
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
import { hintText, leftoverHint, matchAllTokens, readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { reshowOffered, SELECTION_REJECTION, resolveSelection, clearOffered } from "@/lib/fsm/flows/cita/selection";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";
import { discardedEspecialidades } from "@/lib/fsm/flows/cita/steps/duplicate";

type EspecialidadResultItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

function matchEspecialidadHint(
  hint: string,
  items: EspecialidadResultItem[],
): EspecialidadResultItem | undefined {
  const hintTokens = normalizeText(hint);
  const matches = items.filter(
    (item) =>
      normalizeText(item.nombreEspecialidad).includes(hintTokens) ||
      hintTokens.includes(normalizeText(item.nombreEspecialidad)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function handleEspecialidadPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EspecialidadResultItem[] };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    return beginReverification(next, "cita_especialidad_pending");
  }

  if (result.status === "error") {
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        searchFailureText("especialidades"),
      ),
    ]);
  }

  const discarded = discardedEspecialidades(next.slots);
  const items = result.items?.filter((item) => !discarded.includes(item.codigoEspecialidad)) ?? [];

  if (result.status === "found" && items.length > 0) {
    const hint = next.slots.citaEspecialidadHintText as string | undefined;
    const matched = hint ? matchEspecialidadHint(hint, items) : undefined;

    if (matched) {
      delete next.slots.citaEspecialidadHintText;
      next.slots.citaEspecialidadId = matched.codigoEspecialidad;
      next.slots.citaEspecialidadNombre = matched.nombreEspecialidad;
      next.state = "cita_establecimiento_pending";
      return buildResult(next, [
        sendText(`Especialidad detectada: ${matched.nombreEspecialidad}. Buscando establecimientos…`),
        query("list_establecimientos", {
          especialidadId: matched.codigoEspecialidad,
          ubigeo: String(next.slots.citaUbigeo ?? ""),
        }),
      ]);
    }

    next.state = "cita_awaiting_especialidad_select";
    const rows: ListRow[] = items.map((item) => ({
      id: item.codigoEspecialidad,
      title: truncateForRow(item.nombreEspecialidad, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona la especialidad:", rows)]);
  }

  return offerOtherDistrito(next, "especialidades");
}

const HINT_MAX_LENGTH = 80;

function askSelectionHints(
  session: Session,
  step: "especialidad" | "establecimiento",
  typed: string,
): HandlerResult | undefined {
  if (!/\p{L}{5,}/u.test(typed) || !readOffered(session.slots)) return undefined;

  const next = cloneSession(session);
  next.state = "cita_selection_hints_pending";
  next.slots.citaSelectionStep = step;
  return buildResult(next, [
    sendText("Un momento, estamos revisando tu respuesta…"),
    query("extract_selection_hints", { step, text: typed }),
  ]);
}

export function handleSelectionHintsPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { especialidad?: unknown; establecimiento?: unknown };
  const step = session.slots.citaSelectionStep === "establecimiento" ? "establecimiento" : "especialidad";
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  delete restored.slots.citaSelectionStep;
  restored.state =
    step === "establecimiento" ? "cita_awaiting_establecimiento_select" : "cita_awaiting_especialidad_select";

  const own = step === "establecimiento" ? result.establecimiento : result.especialidad;
  const matched = typeof own === "string" && offered ? matchAllTokens(own, offered.rows) : undefined;

  if (!matched) {
    return reshowOffered(restored, offered, `No pudimos identificar esa opción. ${SELECTION_REJECTION}`);
  }

  if (step === "especialidad" && typeof result.establecimiento === "string") {
    const hint = hintText(result.establecimiento).slice(0, HINT_MAX_LENGTH);
    if (hint) restored.slots.citaEstablecimientoHintText = hint;
  }

  const tap: InboundEvent = { from: event.from, type: "list", listId: matched.id };
  return step === "establecimiento"
    ? handleAwaitingEstablecimientoSelect(restored, tap)
    : handleAwaitingEspecialidadSelect(restored, tap);
}

export function handleAwaitingEspecialidadSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    onNoMatchText: (typed) => askSelectionHints(session, "especialidad", typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const chosen = readOffered(session.slots)?.rows.find((row) => row.id === replyId);

  const next = clearOffered(session);
  if (outcome.typed && chosen) {
    const hint = leftoverHint(outcome.typed, chosen).slice(0, HINT_MAX_LENGTH);
    if (hint) next.slots.citaEstablecimientoHintText = hint;
  }
  next.slots.citaEspecialidadId = replyId;
  if (chosen) next.slots.citaEspecialidadNombre = chosen.title;
  next.state = "cita_establecimiento_pending";
  return buildResult(next, [
    sendText("Buscando establecimientos…"),
    query("list_establecimientos", {
      especialidadId: replyId,
      ubigeo: String(next.slots.citaUbigeo ?? ""),
    }),
  ]);
}

type EstablecimientoResultItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

export function handleEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EstablecimientoResultItem[] };
  const next = cloneSession(session);

  const hint = next.slots.citaEstablecimientoHintText as string | undefined;
  delete next.slots.citaEstablecimientoHintText;

  if (result.status === "unauthorized") {
    return beginReverification(next, "cita_establecimiento_pending");
  }

  if (result.status === "error") {
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        searchFailureText("establecimientos"),
      ),
    ]);
  }

  if (result.status === "found" && result.items && result.items.length === 1) {
    const [item] = result.items;
    next.slots.citaCodEess = item.renipressCode;
    next.state = "cita_fecha_pending";
    return buildResult(next, [
      sendText(`Establecimiento encontrado: ${item.establishmentName}. Buscando fechas disponibles…`),
      query("list_fechas", {
        codEess: item.renipressCode,
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
      }),
    ]);
  }

  if (result.status === "found" && result.items && result.items.length > 1) {
    const matched = hint
      ? matchAllTokens(
          hint,
          result.items.map((item) => ({ id: item.renipressCode, title: item.establishmentName })),
        )
      : undefined;
    const detected = matched
      ? result.items.find((item) => item.renipressCode === matched.id)
      : undefined;

    if (detected) {
      next.slots.citaCodEess = detected.renipressCode;
      next.state = "cita_fecha_pending";
      return buildResult(next, [
        sendText(`Establecimiento detectado: ${detected.establishmentName}. Buscando fechas disponibles…`),
        query("list_fechas", {
          codEess: detected.renipressCode,
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        }),
      ]);
    }

    next.state = "cita_awaiting_establecimiento_select";
    const rows: ListRow[] = result.items.map((item) => ({
      id: item.renipressCode,
      title: truncateForRow(item.establishmentName, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.quotasOnline} cupo(s) en línea`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona el establecimiento:", rows)]);
  }

  return offerOtherDistrito(next, "establecimientos");
}

export function handleAwaitingEstablecimientoSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    onNoMatchText: (typed) => askSelectionHints(session, "establecimiento", typed),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const next = clearOffered(session);
  next.slots.citaCodEess = replyId;
  next.state = "cita_fecha_pending";
  return buildResult(next, [
    sendText("Buscando fechas disponibles…"),
    query("list_fechas", {
      codEess: replyId,
      especialidadId: String(next.slots.citaEspecialidadId ?? ""),
    }),
  ]);
}
