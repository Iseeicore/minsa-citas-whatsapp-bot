import { normalizeText } from "@/lib/fsm/parsing/text";
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "@/lib/fsm/parsing/gibberish";
import {
  buildResult,
  cloneSession,
  offerList,
  query,
  sendCtaUrl,
  sendText,
  truncateForRow,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { searchDistrito, searchDistritoByPrefix } from "@/lib/fsm/flows/cita/ubigeo-data";
import type { HandlerResult, ListRow, Session } from "@/lib/fsm/core/types";

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
  delete next.counters.distritoNotFound;
  next.state = "cita_awaiting_departamento";
  return buildResult(next, [sendText(text)]);
}

const PILOT_DEPARTAMENTO = "LIMA";
const NATIONAL_REDIRECT_BUTTON_TEXT = "Cita Nivel Global";
const NATIONAL_REDIRECT_URL = "https://dminsadigital.minsa.gob.pe/login";

/** Alcance del piloto: la reserva por nombre de distrito solo atiende Lima; fuera de Lima se deriva al sitio nacional. */
function filterToPilotScope(
  candidates: DistritoAiCandidateResult[],
): DistritoAiCandidateResult[] {
  return candidates.filter(
    (candidate) => normalizeText(candidate.departamento) === PILOT_DEPARTAMENTO,
  );
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
    next.slots.citaDepartamento = candidate.departamento;
    next.slots.citaProvincia = candidate.provincia;
    next.slots.citaDistrito = candidate.distrito;
    next.state = "cita_ubigeo_pending";
    return buildResult(next, [
      sendText("Buscando tu ubigeo…"),
      query("search_ubigeo", {
        departamento: candidate.departamento,
        provincia: candidate.provincia,
        distrito: candidate.distrito,
      }),
    ]);
  }

  if (candidates.length > WHATSAPP_LIST_MAX_ROWS) {
    next.state = "cita_awaiting_departamento";
    return buildResult(next, [
      sendText(
        "Encontramos demasiadas coincidencias para mostrarlas en una lista, vamos a pedirlo por partes. Indícanos el departamento donde buscas atención.",
      ),
    ]);
  }

  if (candidates.length > 1) {
    next.state = "cita_awaiting_distrito_disambiguation";
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

  next.state = "cita_national_redirect";
  return buildResult(next, [
    sendCtaUrl(
      "Por el momento el agendamiento automático por este canal solo está disponible en Lima. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.",
      NATIONAL_REDIRECT_BUTTON_TEXT,
      NATIONAL_REDIRECT_URL,
    ),
  ]);
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
  next.state = "cita_distrito_ai_pending";
  return buildResult(next, [
    sendText(`Buscando tu distrito: "${distritoText}"…`),
    query("resolve_distrito_ai", { distritoText, contextText }),
  ]);
}
