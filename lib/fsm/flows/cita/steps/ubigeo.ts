import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text";
import {
  DISTRITO_MANUAL_FALLBACK_TEXT,
  enterManualDistritoFlow,
  looksLikePlaceName,
  resolveDistritoCandidates,
  resolveDistritoText,
  type DistritoAiCandidateResult,
} from "@/lib/fsm/flows/cita/distrito-resolver";
import {
  buildResult,
  cloneSession,
  isAffirmativeReply,
  offerList,
  query,
  sendText,
  truncateForRow,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/gibberish";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { resolveSelection, reshowOffered, clearOffered } from "@/lib/fsm/flows/cita/selection";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";
import { isAllowedDepartamento, redirectToNationalSite } from "@/lib/fsm/flows/cita/pilot-scope";
import type { DistritoAiOutcome } from "@/lib/fsm/parsing/ai/distrito";


export function handleAwaitingDistritoAi(session: Session, event: InboundEvent): HandlerResult {
  const rawText = (event.text ?? "").trim();
  if (!rawText) {
    return buildResult(session, [sendText("Cuéntanos el nombre del distrito.")]);
  }

  const initialMessageText = session.slots.initialMessageText as string | undefined;

  const distritoText =
    isAffirmativeReply(rawText) && initialMessageText ? initialMessageText : rawText;
  const contextText = distritoText === rawText ? initialMessageText : undefined;

  return resolveDistritoText(session, distritoText, contextText);
}

const MAX_DISTRITO_NOT_FOUND = 2;

export function handleDistritoAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { outcome?: DistritoAiOutcome; candidates?: DistritoAiCandidateResult[] };

  if (result.outcome === "failed") {
    return enterManualDistritoFlow(session, DISTRITO_MANUAL_FALLBACK_TEXT);
  }

  if (result.outcome === "not_found") {
    const misses = (session.counters.distritoNotFound ?? 0) + 1;
    if (misses >= MAX_DISTRITO_NOT_FOUND) {
      return enterManualDistritoFlow(session, DISTRITO_MANUAL_FALLBACK_TEXT);
    }
    const next = cloneSession(session);
    next.counters.distritoNotFound = misses;
    next.state = "cita_awaiting_distrito_ai";
    return buildResult(next, [sendText(UNRECOGNIZED_DISTRITO_TEXT)]);
  }

  const next = cloneSession(session);
  delete next.counters.distritoNotFound;
  return resolveDistritoCandidates(next, result.candidates ?? []);
}

export function handleAwaitingDistritoDisambiguation(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    onNoMatchText: (typed) => {
      if (!looksLikePlaceName(typed) || isAffirmativeReply(typed)) return undefined;
      if (isGibberishPlaceText(typed)) {
        return reshowOffered(session, readOffered(session.slots), UNRECOGNIZED_DISTRITO_TEXT);
      }
      return resolveDistritoText(
        clearOffered(session),
        typed,
        session.slots.initialMessageText as string | undefined,
      );
    },
  });
  if ("result" in outcome) return outcome.result;

  const parts = outcome.replyId.split("|");
  if (parts.length !== 3) {
    return reshowOffered(session, readOffered(session.slots));
  }

  const [departamento, provincia, distrito] = parts;
  const next = clearOffered(session);
  next.slots.citaDepartamento = departamento;
  next.slots.citaProvincia = provincia;
  next.slots.citaDistrito = distrito;
  next.state = "cita_ubigeo_pending";
  return buildResult(next, [
    sendText("Buscando tu ubigeo…"),
    query("search_ubigeo", { departamento, provincia, distrito }),
  ]);
}

export function handleAwaitingDepartamento(session: Session, event: InboundEvent): HandlerResult {
  const departamento = (event.text ?? "").trim();
  if (!departamento) {
    return buildResult(session, [sendText("Indícanos el departamento.")]);
  }

  const next = cloneSession(session);
  next.slots.citaDepartamento = departamento;
  next.state = "cita_awaiting_provincia";
  return buildResult(next, [sendText("¿En qué provincia?")]);
}

export function handleAwaitingProvincia(session: Session, event: InboundEvent): HandlerResult {
  const provincia = (event.text ?? "").trim();
  if (!provincia) {
    return buildResult(session, [sendText("Indícanos la provincia.")]);
  }

  const next = cloneSession(session);
  next.slots.citaProvincia = provincia;
  next.state = "cita_awaiting_distrito";
  return buildResult(next, [sendText("¿En qué distrito?")]);
}

export function handleAwaitingDistrito(session: Session, event: InboundEvent): HandlerResult {
  const distrito = (event.text ?? "").trim();
  if (!distrito) {
    return buildResult(session, [sendText("Indícanos el distrito.")]);
  }

  const next = cloneSession(session);
  next.slots.citaDistrito = distrito;
  next.state = "cita_ubigeo_pending";
  return buildResult(next, [
    sendText("Buscando tu ubigeo…"),
    query("search_ubigeo", {
      departamento: String(next.slots.citaDepartamento ?? ""),
      provincia: String(next.slots.citaProvincia ?? ""),
      distrito,
    }),
  ]);
}

type UbigeoResultItem = {
  ubigeoInei: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

function pickSettledUbigeo(session: Session, items: UbigeoResultItem[]): UbigeoResultItem | undefined {
  if (items.length === 1) return items[0];

  const same = (found: string, known: unknown) =>
    typeof known !== "string" || known === "" || normalizeText(found) === normalizeText(known);
  const exact = items.filter(
    (item) =>
      typeof session.slots.citaDistrito === "string" &&
      normalizeText(item.distrito) === normalizeText(session.slots.citaDistrito) &&
      same(item.provincia, session.slots.citaProvincia) &&
      same(item.departamento, session.slots.citaDepartamento),
  );
  return exact.length === 1 ? exact[0] : undefined;
}

const searchingCatalogText = (distrito: string) =>
  `Entendido. Buscando especialidades y citas disponibles en *${toDisplayPlace(distrito)}*…`;

export function handleUbigeoPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: UbigeoResultItem[] };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    return beginReverification(next, "cita_ubigeo_pending");
  }

  if (result.status === "error") {
    next.state = "cita_awaiting_departamento";
    return buildResult(next, [
      sendText("Ocurrió un error al buscar tu ubigeo. Indícanos nuevamente el departamento."),
    ]);
  }

  const items = result.items?.filter((item) => isAllowedDepartamento(item.departamento));
  if (result.status === "found" && result.items && result.items.length > 0 && items?.length === 0) {
    return redirectToNationalSite(next);
  }

  const settled = result.status === "found" && items ? pickSettledUbigeo(next, items) : undefined;
  if (settled) {
    next.slots.citaUbigeo = settled.ubigeoInei;
    next.state = "cita_especialidad_pending";
    return buildResult(next, [
      sendText(searchingCatalogText(settled.distrito)),
      query("list_especialidades", { ubigeo: settled.ubigeoInei }),
    ]);
  }

  if (result.status === "found" && items && items.length > 1 && items.length <= WHATSAPP_LIST_MAX_ROWS) {
    next.state = "cita_awaiting_ubigeo_select";
    const rows: ListRow[] = items.map((item) => ({
      id: item.ubigeoInei,
      title: truncateForRow(item.distrito, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.provincia} — ${item.departamento}`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona tu ubigeo:", rows)]);
  }

  next.state = "cita_awaiting_departamento";
  return buildResult(next, [
    sendText("No encontramos ese ubigeo. Indícanos nuevamente el departamento."),
  ]);
}

export function handleAwaitingUbigeoSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, { includeDescription: true });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  const chosen = readOffered(session.slots)?.rows.find((row) => row.id === replyId);
  const next = clearOffered(session);
  next.slots.citaUbigeo = replyId;
  next.state = "cita_especialidad_pending";
  return buildResult(next, [
    sendText(chosen ? searchingCatalogText(chosen.title) : "Buscando especialidades disponibles…"),
    query("list_especialidades", { ubigeo: replyId }),
  ]);
}
