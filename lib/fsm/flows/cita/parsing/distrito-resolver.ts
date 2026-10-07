import { normalizeText } from "@/lib/fsm/parsing/text/text";
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/text/gibberish";
import {
  buildResult,
  cloneSession,
  offerList,
  query,
  sendText,
  truncateForRow,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { searchDistrito, searchDistritoByPrefix } from "@/lib/fsm/flows/cita/data/ubigeo-data";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";
import { isAllowedDepartamento, redirectToNationalSite } from "@/lib/fsm/flows/cita/pilot-scope";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

export function looksLikePlaceName(text: string): boolean {
  return /^[\p{L}][\p{L}\s.'-]{2,59}$/u.test(text);
}

export type DistritoAiCandidateResult = {
  departamento: string;
  provincia: string;
  distrito: string;
};

export const DISTRITO_MANUAL_FALLBACK_TEXT =
  "No pudimos identificar tu distrito en este momento. Vamos por partes: indícanos el departamento donde buscas atención.";

export function enterManualDistritoFlow(session: Session, text: string): HandlerResult {
  const next = cloneSession(session);
  delete next.counters[CounterKey.DISTRITO_NOT_FOUND];
  next.state = SessionState.CITA_AWAITING_DEPARTAMENTO;
  return buildResult(next, [sendText(text)]);
}

function filterToPilotScope(
  candidates: DistritoAiCandidateResult[],
): DistritoAiCandidateResult[] {
  return candidates.filter((candidate) => isAllowedDepartamento(candidate.departamento));
}

function trailingWordGroupAttempts(text: string): Array<() => DistritoAiCandidateResult[]> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const attempts: Array<() => DistritoAiCandidateResult[]> = [];

  for (let start = 1; start < words.length; start++) {
    const tail = words.slice(start).join(" ");
    attempts.push(() => searchDistrito(tail));
    attempts.push(() => searchDistritoByPrefix(tail));
  }

  return attempts;
}

function resolveLocalDistritoCandidates(
  distritoText: string,
  contextText: string | undefined,
): DistritoAiCandidateResult[] {
  const attempts = [
    () => searchDistrito(distritoText),
    () => (contextText ? searchDistrito(contextText) : []),
    () => searchDistritoByPrefix(distritoText),
    () => (contextText ? searchDistritoByPrefix(contextText) : []),
    ...trailingWordGroupAttempts(distritoText),
    ...(contextText ? trailingWordGroupAttempts(contextText) : []),
  ];

  for (const attempt of attempts) {
    const filtered = filterToPilotScope(attempt());
    if (filtered.length > 0) return filtered;
  }

  return [];
}

export function resolveDistritoCandidates(
  session: Session,
  rawCandidates: DistritoAiCandidateResult[],
): HandlerResult {
  const candidates = filterToPilotScope(rawCandidates);
  const next = cloneSession(session);

  if (candidates.length === 1) {
    const [candidate] = candidates;
    next.slots[SlotKey.CITA_DEPARTAMENTO] = candidate.departamento;
    next.slots[SlotKey.CITA_PROVINCIA] = candidate.provincia;
    next.slots[SlotKey.CITA_DISTRITO] = candidate.distrito;
    next.state = SessionState.CITA_UBIGEO_PENDING;
    return buildResult(next, [
      sendText("Buscando tu ubigeo…"),
      query(QueryKind.SEARCH_UBIGEO, {
        departamento: candidate.departamento,
        provincia: candidate.provincia,
        distrito: candidate.distrito,
      }),
    ]);
  }

  if (candidates.length > WHATSAPP_LIST_MAX_ROWS) {
    next.state = SessionState.CITA_AWAITING_DEPARTAMENTO;
    return buildResult(next, [
      sendText(
        "Encontramos demasiadas coincidencias para mostrarlas en una lista, vamos a pedirlo por partes. Indícanos el departamento donde buscas atención.",
      ),
    ]);
  }

  if (candidates.length > 1) {
    next.state = SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION;
    const rows: ListRow[] = candidates.map((candidate) => ({
      id: `${candidate.departamento}|${candidate.provincia}|${candidate.distrito}`,
      title: truncateForRow(candidate.distrito, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${candidate.provincia} — ${candidate.departamento}`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Encontramos varias opciones. ¿Cuál es tu distrito?", rows)]);
  }

  return redirectToNationalSite(next);
}

export function resolveDistritoText(
  session: Session,
  distritoText: string,
  contextText: string | undefined,
): HandlerResult {
  const localCandidates = resolveLocalDistritoCandidates(distritoText, contextText);

  if (localCandidates.length > 0) {
    return resolveDistritoCandidates(session, localCandidates);
  }

  if (isGibberishPlaceText(distritoText)) {
    return buildResult(session, [sendText(UNRECOGNIZED_DISTRITO_TEXT)]);
  }

  const next = cloneSession(session);
  next.state = SessionState.CITA_DISTRITO_AI_PENDING;
  return buildResult(next, [
    sendText(`Buscando tu distrito: "${distritoText}"…`),
    query(QueryKind.RESOLVE_DISTRITO_AI, { distritoText, contextText }),
  ]);
}
