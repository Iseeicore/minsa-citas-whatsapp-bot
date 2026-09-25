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

// Resolving a district name to (departamento, provincia, distrito) — the fast
// local-dataset attempt, its Lima-only pilot filter, and the AI fallback for
// what the local dataset can't read. Shared by more than one FSM step (the
// direct "¿en qué distrito buscas atención?" question in steps/ubigeo.ts, the
// disambiguation step's own free-text correction, and steps/no-coverage.ts's
// "¿deseas buscar en otro distrito?" reply) — it lives in its own module so
// none of those need to import from one another to reuse it.

// Guards the dataset -> AI district chain against junk ("a|b|c", "12345"):
// only letters, spaces and the punctuation real place names use.
export function looksLikePlaceName(text: string): boolean {
  return /^[\p{L}][\p{L}\s.'-]{2,59}$/u.test(text);
}

export type DistritoAiCandidateResult = {
  departamento: string;
  provincia: string;
  distrito: string;
};

// PILOT SCOPE: appointment booking only serves Lima for now. Filtering here
// (the single point both the local-dataset path and the AI path funnel into)
// drops national noise before deciding what to do with N candidates — e.g.
// "Miraflores" narrows from 4 nationwide matches down to the 2 in Lima
// department. This does NOT restrict the manual departamento/provincia/
// distrito fallback in steps/ubigeo.ts, which still accepts any department —
// only the automatic name-based resolution is Lima-only during the pilot.
// Next phase: once this expands nationally, remove this filter and add a
// provincia follow-up question for names that are still ambiguous within a
// single departamento.
const PILOT_DEPARTAMENTO = "LIMA";
const NATIONAL_REDIRECT_BUTTON_TEXT = "Cita Nivel Global"; // 17 chars — cta_url's display_text caps at 20
const NATIONAL_REDIRECT_URL = "https://dminsadigital.minsa.gob.pe/login";

function filterToPilotScope(
  candidates: DistritoAiCandidateResult[],
): DistritoAiCandidateResult[] {
  return candidates.filter(
    (candidate) => normalizeText(candidate.departamento) === PILOT_DEPARTAMENTO,
  );
}

// Tries increasingly loose local strategies — exact match, then prefix match —
// against both the direct reply and the opening-message context, evaluating
// each attempt ALREADY FILTERED TO LIMA before deciding whether it "found"
// something. This matters because an exact match can succeed nationally but
// fail the pilot's scope: "San Juan" is itself an official district name in
// four other regions (none in Lima), so a raw exact match finds those and
// would wrongly conclude "not in Lima" — without this, searchDistritoByPrefix
// never gets a chance to find "San Juan de Lurigancho"/"San Juan de
// Miraflores", which are real Lima districts that merely aren't an exact
// match for "San Juan".
// A district mentioned inside a full sentence ("Quiero una cita en San juan")
// isn't itself an exact match, and isn't a PREFIX of any district name either
// — the sentence's leading words ("Quiero una cita en ") aren't part of any
// real district name, so searchDistritoByPrefix(full sentence) never matches
// even though the sentence clearly names one at the end. This tries
// progressively shorter trailing word-groups ("una cita en San juan" ->
// "cita en San juan" -> ... -> "San juan") as exact/prefix keys, so the same
// deterministic dataset match that already works for a bare district name
// also works when it's the tail end of a sentence.
function trailingWordGroupAttempts(text: string): Array<() => DistritoAiCandidateResult[]> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const attempts: Array<() => DistritoAiCandidateResult[]> = [];

  // start=0 (the whole text) is already covered by resolveLocalDistritoCandidates's
  // own first two attempts, so this only adds shorter tails.
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

// What to do with N resolved candidates — shared by the local-dataset fast
// path (resolveDistritoText below) and the AI-result path
// (steps/ubigeo.ts's handleDistritoAiPending).
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
    // Too many matches to fit WhatsApp's 10-row list cap (a broad name like
    // "San Juan" can legitimately match a dozen+ official districts) —
    // sending an oversized list would just get rejected in silence, so this
    // falls back to the manual flow the same way zero candidates does.
    next.state = "cita_awaiting_departamento";
    return buildResult(next, [
      sendText(
        "Encontramos demasiadas coincidencias para mostrarlas en una lista, vamos a pedirlo por partes. Indícanos el departamento donde buscas atención.",
      ),
    ]);
  }

  if (candidates.length > 1) {
    next.state = "cita_awaiting_distrito_disambiguation";
    // The chosen candidate's triple is encoded directly in the row id
    // (pipe-separated, same convention as handleAwaitingHoraSelect's
    // `${horaInicio}|${horaFin}`) rather than stashed in slots, since
    // Session.slots only holds flat scalar values. The distrito name alone is
    // the title (WhatsApp caps titles at 24 chars); provincia/departamento —
    // the part that actually disambiguates same-named districts — goes in the
    // description instead of being crammed into the title.
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

  // Zero candidates within Lima — either the district is real but outside the
  // pilot's scope, or it was an unrecognized name. Either way this channel
  // doesn't serve it during the pilot: redirect to the national booking site
  // and end the conversation, instead of falling to the manual departamento/
  // provincia/distrito fallback (that flow stays reachable from
  // steps/ubigeo.ts's handleUbigeoPending, for Lima ubigeos that don't match
  // MINSA's catalog — a different, unrelated failure).
  next.state = "cita_national_redirect";
  return buildResult(next, [
    sendCtaUrl(
      "Por el momento el agendamiento automático por este canal solo está disponible en Lima. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.",
      NATIONAL_REDIRECT_BUTTON_TEXT,
      NATIONAL_REDIRECT_URL,
    ),
  ]);
}

// Fast, free, deterministic first attempt against the real INEI dataset
// (lib/fsm/flows/cita/ubigeo-data.ts) before ever spending an AI call; falls to a
// gibberish check (free) and, last, to the resolve_distrito_ai query.
export function resolveDistritoText(
  session: Session,
  distritoText: string,
  contextText: string | undefined,
): HandlerResult {
  const localCandidates = resolveLocalDistritoCandidates(distritoText, contextText);

  if (localCandidates.length > 0) {
    return resolveDistritoCandidates(session, localCandidates);
  }

  // Free and deterministic: keyboard mashing ("asdfghjk") never earns a paid AI
  // call. A genuine typo still goes through.
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
