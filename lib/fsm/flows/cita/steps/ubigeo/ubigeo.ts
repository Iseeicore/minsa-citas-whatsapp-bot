import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import {
  DISTRITO_MANUAL_FALLBACK_TEXT,
  enterManualDistritoFlow,
  looksLikePlaceName,
  resolveDistritoCandidates,
  resolveDistritoText,
  type DistritoAiCandidateResult,
} from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
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
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/text/gibberish";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { resolveSelection, reshowOffered, clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/identity/reverification";
import { isAllowedDepartamento, redirectToNationalSite } from "@/lib/fsm/flows/cita/pilot-scope";
import type { DistritoAiOutcome } from "@/lib/fsm/parsing/ai/distrito";
import { DistritoAiOutcome as DistritoAiOutcomeEnum } from "@/lib/enums/distrito-ai-outcome";
import { QueryKind } from "@/lib/enums/query-kind";
import { askToLeave } from "@/lib/fsm/flows/cita/steps/exit/exit";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";

export function handleAwaitingDistritoAi(session: Session, event: InboundEvent): HandlerResult {
  const rawText = (event.text ?? "").trim();
  if (!rawText) {
    return buildResult(session, [sendText("Cuéntanos el nombre del distrito.")]);
  }

  const initialMessageText = session.slots[SlotKey.INITIAL_MESSAGE_TEXT];

  const distritoText =
    isAffirmativeReply(rawText) && initialMessageText ? initialMessageText : rawText;
  const contextText = distritoText === rawText ? initialMessageText : undefined;

  return resolveDistritoText(session, distritoText, contextText);
}

const MAX_DISTRITO_NOT_FOUND = 2;

export function handleDistritoAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { outcome?: DistritoAiOutcome; candidates?: DistritoAiCandidateResult[]; quiereSalir?: boolean };

  if (result.quiereSalir === true) {
    return askToLeave({ ...cloneSession(session), state: "cita_awaiting_distrito_ai" }, "ai");
  }

  if (result.outcome === DistritoAiOutcomeEnum.FAILED) {
    return enterManualDistritoFlow(session, DISTRITO_MANUAL_FALLBACK_TEXT);
  }

  if (result.outcome === DistritoAiOutcomeEnum.NOT_FOUND) {
    const misses = (session.counters[CounterKey.DISTRITO_NOT_FOUND] ?? 0) + 1;
    if (misses >= MAX_DISTRITO_NOT_FOUND) {
      return enterManualDistritoFlow(session, DISTRITO_MANUAL_FALLBACK_TEXT);
    }
    const next = cloneSession(session);
    next.counters[CounterKey.DISTRITO_NOT_FOUND] = misses;
    next.state = "cita_awaiting_distrito_ai";
    return buildResult(next, [sendText(UNRECOGNIZED_DISTRITO_TEXT)]);
  }

  const next = cloneSession(session);
  delete next.counters[CounterKey.DISTRITO_NOT_FOUND];
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
        session.slots[SlotKey.INITIAL_MESSAGE_TEXT],
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
  next.slots[SlotKey.CITA_DEPARTAMENTO] = departamento;
  next.slots[SlotKey.CITA_PROVINCIA] = provincia;
  next.slots[SlotKey.CITA_DISTRITO] = distrito;
  next.state = "cita_ubigeo_pending";
  return buildResult(next, [
    sendText("Buscando tu ubigeo…"),
    query(QueryKind.SEARCH_UBIGEO, { departamento, provincia, distrito }),
  ]);
}

export function handleAwaitingDepartamento(session: Session, event: InboundEvent): HandlerResult {
  const departamento = (event.text ?? "").trim();
  if (!departamento) {
    return buildResult(session, [sendText("Indícanos el departamento.")]);
  }

  if (isGibberishPlaceText(departamento)) {
    return buildResult(session, [sendText("No pudimos leer eso. Indícanos el departamento.")]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DEPARTAMENTO] = departamento;
  next.state = "cita_awaiting_provincia";
  return buildResult(next, [sendText("¿En qué provincia?")]);
}

export function handleAwaitingProvincia(session: Session, event: InboundEvent): HandlerResult {
  const provincia = (event.text ?? "").trim();
  if (!provincia) {
    return buildResult(session, [sendText("Indícanos la provincia.")]);
  }

  if (isGibberishPlaceText(provincia)) {
    return buildResult(session, [sendText("No pudimos leer eso. ¿En qué provincia?")]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CITA_PROVINCIA] = provincia;
  next.state = "cita_awaiting_distrito";
  return buildResult(next, [sendText("¿En qué distrito?")]);
}

export function handleAwaitingDistrito(session: Session, event: InboundEvent): HandlerResult {
  const distrito = (event.text ?? "").trim();
  if (!distrito) {
    return buildResult(session, [sendText("Indícanos el distrito.")]);
  }

  if (isGibberishPlaceText(distrito)) {
    return buildResult(session, [sendText("No pudimos leer eso. Indícanos el distrito.")]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.CITA_DISTRITO] = distrito;
  next.state = "cita_ubigeo_pending";
  return buildResult(next, [
    sendText("Buscando tu ubigeo…"),
    query(QueryKind.SEARCH_UBIGEO, {
      departamento: String(next.slots[SlotKey.CITA_DEPARTAMENTO] ?? ""),
      provincia: String(next.slots[SlotKey.CITA_PROVINCIA] ?? ""),
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
      typeof session.slots[SlotKey.CITA_DISTRITO] === "string" &&
      normalizeText(item.distrito) === normalizeText(session.slots[SlotKey.CITA_DISTRITO]) &&
      same(item.provincia, session.slots[SlotKey.CITA_PROVINCIA]) &&
      same(item.departamento, session.slots[SlotKey.CITA_DEPARTAMENTO]),
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
    next.slots[SlotKey.CITA_UBIGEO] = settled.ubigeoInei;
    next.state = "cita_especialidad_pending";
    return buildResult(next, [
      sendText(searchingCatalogText(settled.distrito)),
      query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: settled.ubigeoInei }),
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
  next.slots[SlotKey.CITA_UBIGEO] = replyId;
  next.state = "cita_especialidad_pending";
  return buildResult(next, [
    sendText(chosen ? searchingCatalogText(chosen.title) : "Buscando especialidades disponibles…"),
    query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: replyId }),
  ]);
}
