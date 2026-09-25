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

// ---- Especialidad --------------------------------------------------------

type EspecialidadResultItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

// Deterministic match against the REAL especialidad list — never a second
// AI call. Only auto-selects when exactly one item matches the hint the
// citizen already typed in their opening message (analyzed by
// analyzeMainMenuIntent in lib/fsm/parsing/ai/main-menu-intent.ts); an ambiguous or absent match
// falls through to the normal always-manual list below, same as if there
// were no hint at all.
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
        "Ocurrió un error al buscar especialidades disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  if (result.status === "found" && result.items && result.items.length > 0) {
    // Auto-select ONLY when the citizen already told us the specialty in
    // free text before ever reaching the menu (see handlers.ts's
    // main_menu_intent_pending) and it unambiguously matches one of the
    // real options — asking them to tap it again would be a repeated step.
    // Coming from the normal "Agendar cita" menu tap (no hint), this is
    // skipped entirely and the list always shows, per the existing rule.
    const hint = next.slots.citaEspecialidadHintText as string | undefined;
    const matched = hint ? matchEspecialidadHint(hint, result.items) : undefined;

    if (matched) {
      delete next.slots.citaEspecialidadHintText;
      next.slots.citaEspecialidadId = matched.codigoEspecialidad;
      next.state = "cita_establecimiento_pending";
      return buildResult(next, [
        sendText(`Especialidad detectada: ${matched.nombreEspecialidad}. Buscando establecimientos…`),
        query("list_establecimientos", {
          especialidadId: matched.codigoEspecialidad,
          ubigeo: String(next.slots.citaUbigeo ?? ""),
        }),
      ]);
    }

    // Unlike the other catalog steps, especialidad is never auto-selected —
    // the citizen must always tap it themselves from the list, even when
    // there's only one option. Explicit product decision, not an oversight.
    next.state = "cita_awaiting_especialidad_select";
    const rows: ListRow[] = result.items.map((item) => ({
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

// Something else named in the same message (an establishment, typically) is
// kept and applied when that list arrives — see handleEstablecimientoPending.
const HINT_MAX_LENGTH = 80;

function askSelectionHints(
  session: Session,
  step: "especialidad" | "establecimiento",
  typed: string,
): HandlerResult | undefined {
  // Only real words are worth an AI call — not "asdf" or "12345".
  if (!/\p{L}{5,}/u.test(typed) || !readOffered(session.slots)) return undefined;

  const next = cloneSession(session);
  next.state = "cita_selection_hints_pending";
  next.slots.citaSelectionStep = step;
  return buildResult(next, [
    sendText("Un momento, estamos revisando tu respuesta…"),
    query("extract_selection_hints", { step, text: typed }),
  ]);
}

// The AI only names things; they are matched against the rows actually offered
// and applied only when exactly one row fits every word. Otherwise: the list.
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
  next.state = "cita_establecimiento_pending";
  return buildResult(next, [
    sendText("Buscando establecimientos…"),
    query("list_establecimientos", {
      especialidadId: replyId,
      ubigeo: String(next.slots.citaUbigeo ?? ""),
    }),
  ]);
}

// ---- Establecimiento -----------------------------------------------------

type EstablecimientoResultItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

export function handleEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EstablecimientoResultItem[] };
  const next = cloneSession(session);

  // A hint is used once, on this list, and never kept around.
  const hint = next.slots.citaEstablecimientoHintText as string | undefined;
  delete next.slots.citaEstablecimientoHintText;

  if (result.status === "unauthorized") {
    return beginReverification(next, "cita_establecimiento_pending");
  }

  if (result.status === "error") {
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar establecimientos disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
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
    // The citizen already named the establishment ("...en el hospital de
    // Lurigancho"): apply it only when it singles out exactly one of the real
    // options, so asking again would be a repeated step.
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
