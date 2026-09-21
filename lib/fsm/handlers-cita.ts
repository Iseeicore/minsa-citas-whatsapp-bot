import { handleOtherDistrito, offerOtherDistrito, OTHER_DISTRITO_STATE } from "./cita-no-coverage";
import { closeWithApology, discardedDates, handleOtherFecha, offerOtherFecha, OTHER_FECHA_STATE } from "./cita-other-fecha";
import { isSlotAcceptance, resolveConfirmation } from "./confirmation-parser";
import { isValidDniFormat, isValidOtpFormat, normalizeText, toDisplayPlace } from "./domain";
import {
  buildResult,
  cloneSession,
  query,
  readReply,
  sendText,
  sendList,
  sendButtons,
  sendCtaUrl,
  withNote,
} from "./handlers-shared";
import { searchDistrito, searchDistritoByPrefix } from "./ubigeo-data";
import { formatFechaForApi } from "./minsa";
import { formatDateLong, formatDateShort, matchFechaText, parseOfferedDate, type DateParts } from "./date-parser";
import { isGibberishPlaceText, UNRECOGNIZED_DISTRITO_TEXT } from "./gibberish";
import { matchHoraText, packHoraSlots, unpackHoraSlots, type HoraSlot } from "./time-parser";
import {
  hintText,
  leftoverHint,
  matchAllTokens,
  matchSelection,
  OFFERED_SLOT,
  readOffered,
  serializeOffered,
  type OfferedList,
  type OfferedRow,
  type SelectionMatch,
} from "./selection-matchers";
import type {
  HandleEvent,
  HandlerResult,
  InboundEvent,
  ListRow,
  QueryResultEvent,
  SendEffect,
  Session,
} from "./types";

const MAX_REGISTRATION_CHECKS = 3;
const MAX_OTP_ATTEMPTS = 3;
const MINSADIGITAL_REGISTRATION_URL = "https://dminsadigital.minsa.gob.pe/login";
const MINSADIGITAL_BUTTON_TEXT = "Ir a MINSADIGITAL"; // ≤20 chars, cta_url's display_text cap
const REGISTRATION_RETRY_BUTTON_ID = "cita_registration_retry";
const REGISTRATION_RETRY_BUTTON_TEXT = "Ya me registré";

export function handleCita(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case "cita_awaiting_dni":
      return handleAwaitingDni(session, event as InboundEvent);
    case "cita_validate_pending":
      return handleValidatePending(session, event as QueryResultEvent);
    case "cita_registration_wait":
      return handleRegistrationWait(session, event as InboundEvent);
    case "cita_awaiting_otp":
      return handleAwaitingOtp(session, event as InboundEvent);
    case "cita_verify_pending":
      return handleVerifyPending(session, event as QueryResultEvent);
    case "cita_awaiting_distrito_ai":
      return handleAwaitingDistritoAi(session, event as InboundEvent);
    case "cita_distrito_ai_pending":
      return handleDistritoAiPending(session, event as QueryResultEvent);
    case "cita_awaiting_distrito_disambiguation":
      return handleAwaitingDistritoDisambiguation(session, event as InboundEvent);
    case "cita_awaiting_departamento":
      return handleAwaitingDepartamento(session, event as InboundEvent);
    case "cita_awaiting_provincia":
      return handleAwaitingProvincia(session, event as InboundEvent);
    case "cita_awaiting_distrito":
      return handleAwaitingDistrito(session, event as InboundEvent);
    case "cita_ubigeo_pending":
      return handleUbigeoPending(session, event as QueryResultEvent);
    case "cita_awaiting_ubigeo_select":
      return handleAwaitingUbigeoSelect(session, event as InboundEvent);
    case OTHER_DISTRITO_STATE:
      return handleOtherDistrito(session, event as InboundEvent);
    case "cita_especialidad_pending":
      return handleEspecialidadPending(session, event as QueryResultEvent);
    case "cita_awaiting_especialidad_select":
      return handleAwaitingEspecialidadSelect(session, event as InboundEvent);
    case "cita_establecimiento_pending":
      return handleEstablecimientoPending(session, event as QueryResultEvent);
    case "cita_awaiting_establecimiento_select":
      return handleAwaitingEstablecimientoSelect(session, event as InboundEvent);
    case "cita_selection_hints_pending":
      return handleSelectionHintsPending(session, event as QueryResultEvent);
    case "cita_fecha_pending":
      return handleFechaPending(session, event as QueryResultEvent);
    case OTHER_FECHA_STATE:
      return handleOtherFecha(session, event as InboundEvent);
    case "cita_awaiting_fecha_select":
      return handleAwaitingFechaSelect(session, event as InboundEvent);
    case "cita_fecha_ai_pending":
      return handleFechaAiPending(session, event as QueryResultEvent);
    case "cita_hora_pending":
      return handleHoraPending(session, event as QueryResultEvent);
    case "cita_hora_page_pending":
      return handleHoraPagePending(session, event as QueryResultEvent);
    case "cita_awaiting_hora_select":
      return handleAwaitingHoraSelect(session, event as InboundEvent);
    case "cita_awaiting_hora_confirm":
      return handleHoraConfirm(session, event as InboundEvent);
    case "cita_awaiting_hora_choice":
      return handleHoraChoice(session, event as InboundEvent);
    case "cita_booking_pending":
      return handleBookingPending(session, event as QueryResultEvent);
    default:
      throw new Error(`handleCita: unknown state "${session.state}"`);
  }
}

// ---- Identity --------------------------------------------------------

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const dni = (event.text ?? "").trim();

  if (!isValidDniFormat(dni)) {
    return buildResult(session, [sendText("DNI inválido. Debe tener 8 dígitos. Intenta de nuevo.")]);
  }

  const next = cloneSession(session);
  next.slots.citaDniPending = dni;
  next.state = "cita_validate_pending";
  return buildResult(next, [
    sendText("Validando tu DNI…"),
    query("validate_user", { numeroDocumento: dni }),
  ]);
}

function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; twofaId?: string };
  const next = cloneSession(session);

  if (result.status === "valid" && typeof result.twofaId === "string") {
    next.slots.citaTwofaId = result.twofaId;
    next.state = "cita_awaiting_otp";
    return buildResult(next, [
      sendText("Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos)."),
    ]);
  }

  const checks = (next.counters.citaRegistrationChecks ?? 0) + 1;
  next.counters.citaRegistrationChecks = checks;

  if (checks >= MAX_REGISTRATION_CHECKS) {
    next.state = "cita_registration_rejected";
    return buildResult(next, [
      sendText(
        "No pudimos encontrar tu registro después de varios intentos. Por favor, acércate al establecimiento de salud más cercano.",
      ),
    ]);
  }

  next.state = "cita_registration_wait";
  return buildResult(next, [
    sendCtaUrl(
      "Todavía no encontramos tu registro en MINSADIGITAL. Este proceso puede tardar unos minutos.",
      MINSADIGITAL_BUTTON_TEXT,
      MINSADIGITAL_REGISTRATION_URL,
    ),
    sendButtons("Cuando termines, toca el botón para que volvamos a intentarlo.", [
      { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
    ]),
  ]);
}

function handleRegistrationWait(session: Session, event: InboundEvent): HandlerResult {
  const isRetry = readReply(event) === REGISTRATION_RETRY_BUTTON_ID;

  if (!isRetry) {
    return buildResult(session, [
      sendButtons("Toca el botón para que volvamos a intentarlo.", [
        { id: REGISTRATION_RETRY_BUTTON_ID, title: REGISTRATION_RETRY_BUTTON_TEXT },
      ]),
    ]);
  }

  const next = cloneSession(session);
  next.state = "cita_validate_pending";
  return buildResult(next, [
    sendText("Validando de nuevo…"),
    query("validate_user", { numeroDocumento: String(next.slots.citaDniPending ?? "") }),
  ]);
}

function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = (event.text ?? "").trim();

  if (!isValidOtpFormat(code)) {
    return buildResult(session, [sendText("Código inválido. Debe tener entre 4 y 8 dígitos.")]);
  }

  const next = cloneSession(session);
  next.state = "cita_verify_pending";
  return buildResult(next, [
    sendText("Verificando código…"),
    query("verify_code", { twofaId: String(next.slots.citaTwofaId ?? ""), code }),
  ]);
}

function handleVerifyPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; token?: string };
  const next = cloneSession(session);

  if (result.status === "verified" && typeof result.token === "string") {
    const dni = next.slots.citaDniPending;
    // Clear the identity-flow-only slots/counters now that we're moving on
    // to the catalog/booking stage.
    delete next.slots.citaDniPending;
    delete next.slots.citaTwofaId;
    delete next.counters.citaRegistrationChecks;
    delete next.counters.citaOtpAttempts;

    next.slots.citaBearer = result.token;
    next.slots.citaDni = dni ?? null;
    next.state = "cita_awaiting_distrito_ai";

    // Re-verifying after an expired token mid-flow (see
    // beginReverification below) takes priority over the district hint —
    // by this point we're well past the district step, already resolved.
    const resumeState = next.slots.citaResumeState as string | undefined;
    if (resumeState) {
      delete next.slots.citaResumeState;
      return resumeAfterReverification(next, resumeState);
    }

    // If the citizen already named a place in their opening free-text
    // message (see handlers.ts's main_menu_intent_pending), search it right
    // away instead of asking the generic question again — they already told
    // us. Falls back to asking normally when there's no such hint.
    const distritoHint = next.slots.citaDistritoHintText as string | undefined;
    if (distritoHint) {
      delete next.slots.citaDistritoHintText;
      return resolveDistritoText(
        next,
        distritoHint,
        next.slots.initialMessageText as string | undefined,
      );
    }

    return buildResult(next, [
      sendText('¡Verificado! Cuéntanos en qué distrito buscas atención (ej. "Miraflores").'),
    ]);
  }

  const attempts = (next.counters.citaOtpAttempts ?? 0) + 1;
  next.counters.citaOtpAttempts = attempts;

  if (attempts >= MAX_OTP_ATTEMPTS) {
    next.state = "cita_otp_locked";
    return buildResult(next, [
      sendText("Superaste el número de intentos permitidos. Por favor, inicia el proceso nuevamente más tarde."),
    ]);
  }

  next.state = "cita_awaiting_otp";
  return buildResult(next, [
    sendText(`Código incorrecto. Te quedan ${MAX_OTP_ATTEMPTS - attempts} intento(s).`),
  ]);
}

// ---- Token-expiry recovery ------------------------------------------------
// MINSA's bearer token only lasts about 30 minutes. If a citizen pauses
// mid-flow (deciding on a specialty, a date, etc.) and comes back later, the
// next catalog/booking call fails with a 401 — surfaced as
// result.status === "unauthorized" by lib/fsm/minsa.ts. Treating that like
// any other API error would end the whole booking and discard everything
// already chosen (district, especialidad, establecimiento…). Instead, this
// asks the citizen to verify again WITHOUT losing that progress, then
// resumes exactly at the step that failed once they do.

function beginReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.slots.citaResumeState = resumeState;
  delete next.slots.citaBearer;
  next.state = "cita_awaiting_dni";
  return buildResult(next, [
    sendText(
      "Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu DNI (8 dígitos) para continuar justo donde quedaste.",
    ),
  ]);
}

// Re-fires the exact query the citizen was waiting on when their token
// expired, using whatever's already stored in slots — never re-asks a
// question they already answered. book_appointment resumes one step
// earlier (re-listing horarios) instead of resubmitting a possibly-stale
// hora selection, since real time passed and that slot might be gone.
function resumeAfterReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.state = resumeState;

  switch (resumeState) {
    case "cita_ubigeo_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando tu ubigeo…"),
        query("search_ubigeo", {
          departamento: String(next.slots.citaDepartamento ?? ""),
          provincia: String(next.slots.citaProvincia ?? ""),
          distrito: String(next.slots.citaDistrito ?? ""),
        }),
      ]);

    case "cita_especialidad_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando especialidades disponibles…"),
        query("list_especialidades", { ubigeo: String(next.slots.citaUbigeo ?? "") }),
      ]);

    case "cita_establecimiento_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando establecimientos…"),
        query("list_establecimientos", {
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
          ubigeo: String(next.slots.citaUbigeo ?? ""),
        }),
      ]);

    case "cita_fecha_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando fechas disponibles…"),
        query("list_fechas", {
          codEess: String(next.slots.citaCodEess ?? ""),
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        }),
      ]);

    case "cita_hora_pending":
    default:
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando horarios disponibles…"),
        query("list_horas", {
          codEess: String(next.slots.citaCodEess ?? ""),
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
          fecha: String(next.slots.citaFecha ?? ""),
        }),
      ]);
  }
}

// ---- Ubigeo ------------------------------------------------------------

// AI-assisted entry point: tries to resolve departamento/provincia/distrito
// from a single district-name message before falling back to the manual
// 3-question chain below (cita_awaiting_departamento onward), which stays
// completely unchanged as the safety net.

// Short affirmative replies ("sí", "ese", "yes", "s", ...) carry no place
// name of their own — relying on the AI alone to notice this and fall back
// to the opening message is not reliable (it depends on the AI being
// enabled at all, and on it reasoning about it correctly every time).
// Detecting these deterministically means the fallback to the citizen's
// opening message works the same way whether SANDBOX_USE_REAL_AI is on or
// off, and never depends on model behavior for this specific case.
const AFFIRMATIVE_REPLIES = new Set([
  "si",
  "sí",
  "s",
  "yes",
  "y",
  "ese",
  "esa",
  "eso",
  "correcto",
  "exacto",
  "confirmo",
  "afirmativo",
  "claro",
  "asi es",
  "así es",
]);

function isAffirmativeReply(text: string): boolean {
  return AFFIRMATIVE_REPLIES.has(text.trim().toLowerCase());
}

// WhatsApp's interactive list rows have hard limits — Meta rejects the
// whole message (silently, from the citizen's side: sendAndRecordEffect
// logs it server-side and never throws) if a title exceeds 24 characters,
// a description exceeds 72, or there are more than 10 rows total. District
// and establishment names routinely blow past 24 chars on their own (e.g.
// "San Juan de Lurigancho"), so every row built from real-world names goes
// through this truncation as cheap insurance.
const WHATSAPP_ROW_TITLE_MAX = 24;
const WHATSAPP_ROW_DESCRIPTION_MAX = 72;
const WHATSAPP_LIST_MAX_ROWS = 10;

function truncateForRow(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

// ---- Selection steps: taps and typed text ---------------------------------
// Every list is sent through offerList so the rows the citizen can pick from
// are remembered (Session.slots only holds scalars, hence a JSON string).
// resolveSelection then turns whatever arrives — a tap, or typed text such as
// "el segundo" / "odontología" / "el de Lima" — into one of THOSE rows, or
// into a rejection that re-shows the list. Unparsed text never reaches MINSA.

const SELECTION_REJECTION = "Selecciona una opción de la lista.";
const NARROWED_LIST_TEXT = "Encontramos varias coincidencias. Selecciona una:";

// Mutates `next` (always a fresh clone at the call sites).
function offerList(next: Session, text: string, rows: ListRow[]): SendEffect {
  next.slots[OFFERED_SLOT] = serializeOffered({ text, rows });
  return sendList(text, rows);
}

function clearOffered(session: Session): Session {
  const next = cloneSession(session);
  delete next.slots[OFFERED_SLOT];
  return next;
}

function reshowOffered(
  session: Session,
  offered: OfferedList | undefined,
  message: string = SELECTION_REJECTION,
): HandlerResult {
  const effects: SendEffect[] = [sendText(message)];
  if (offered) effects.push(sendList(offered.text, offered.rows));
  return buildResult(session, effects);
}

// Guards the dataset -> AI district chain against junk ("a|b|c", "12345"):
// only letters, spaces and the punctuation real place names use.
function looksLikePlaceName(text: string): boolean {
  return /^[\p{L}][\p{L}\s.'-]{2,59}$/u.test(text);
}

function narrowOffered(session: Session, rows: OfferedRow[]): HandlerResult {
  const next = cloneSession(session);
  return buildResult(next, [offerList(next, NARROWED_LIST_TEXT, rows)]);
}

// A step-specific reader tried before the generic ordinal/name matcher. It can
// also explain why nothing was chosen ("notice") instead of a bare rejection.
type CustomMatch =
  | SelectionMatch
  | { kind: "notice"; text: string }
  // The step already knows the whole answer (e.g. a two-button question).
  | { kind: "handled"; result: HandlerResult };

type SelectionOptions = {
  customMatch?: (typed: string, rows: OfferedRow[]) => CustomMatch | undefined;
  // Match typed text against "Provincia — Departamento" descriptions too.
  includeDescription?: boolean;
  // Ids that are valid taps although they are not list rows (pagination buttons).
  passthroughIds?: string[];
  // Text that names nothing offered; return undefined to just re-show the list.
  onNoMatchText?: (typed: string) => HandlerResult | undefined;
};

type SelectionOutcome = { replyId: string; typed?: string } | { result: HandlerResult };

function resolveSelection(
  session: Session,
  event: InboundEvent,
  options: SelectionOptions = {},
): SelectionOutcome {
  const offered = readOffered(session.slots);

  if (event.type === "list" || event.type === "button") {
    const id = event.listId;
    if (!id) return { result: reshowOffered(session, offered) };

    // Sessions opened before offered options were stored have nothing to
    // validate against: keep accepting their taps.
    const valid =
      !offered || offered.rows.some((row) => row.id === id) || options.passthroughIds?.includes(id);
    return valid ? { replyId: id } : { result: reshowOffered(session, offered) };
  }

  const typed = event.type === "text" ? (event.text ?? "").trim() : "";
  if (!typed || !offered) {
    return { result: reshowOffered(session, offered) };
  }

  const custom = options.customMatch?.(typed, offered.rows);
  if (custom?.kind === "match") return { replyId: custom.row.id, typed };
  if (custom?.kind === "ambiguous") return { result: narrowOffered(session, custom.rows) };
  if (custom?.kind === "notice") return { result: reshowOffered(session, offered, custom.text) };
  if (custom?.kind === "handled") return { result: custom.result };

  const match = matchSelection(typed, offered.rows, { includeDescription: options.includeDescription });
  if (match.kind === "match") return { replyId: match.row.id, typed };
  if (match.kind === "ambiguous") return { result: narrowOffered(session, match.rows) };

  return { result: options.onNoMatchText?.(typed) ?? reshowOffered(session, offered) };
}

// Shared by handleAwaitingDistritoAi (a real inbound reply) and
// handleVerifyPending's auto-trigger (a distrito already extracted from the
// citizen's opening free-text message) — "given this district text (plus
// optional context), resolve it" is identical either way.
function resolveDistritoText(
  session: Session,
  distritoText: string,
  contextText: string | undefined,
): HandlerResult {
  // Fast, free, deterministic first attempt against the real INEI dataset
  // (lib/fsm/ubigeo-data.ts) before ever spending an AI call.
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

function handleAwaitingDistritoAi(session: Session, event: InboundEvent): HandlerResult {
  const rawText = (event.text ?? "").trim();
  if (!rawText) {
    return buildResult(session, [sendText("Cuéntanos el nombre del distrito.")]);
  }

  const initialMessageText = session.slots.initialMessageText as string | undefined;

  // A bare affirmative reply on its own names no district — if the citizen
  // already mentioned one in their opening message, treat THAT as the real
  // answer instead of sending the meaningless "sí"/"ese" to be resolved.
  const distritoText =
    isAffirmativeReply(rawText) && initialMessageText ? initialMessageText : rawText;
  const contextText = distritoText === rawText ? initialMessageText : undefined;

  return resolveDistritoText(session, distritoText, contextText);
}

type DistritoAiCandidateResult = {
  departamento: string;
  provincia: string;
  distrito: string;
};

// Shared by the local-dataset fast path above and the AI-result path below —
// "what do we do with N resolved candidates" is identical either way.
// PILOT SCOPE: appointment booking only serves Lima for now. Filtering here
// (the single point both the local-dataset path and the AI path funnel
// into) drops national noise before deciding what to do with N candidates —
// e.g. "Miraflores" narrows from 4 nationwide matches down to the 2 in
// Lima department. This does NOT restrict the manual departamento/
// provincia/distrito fallback below, which still accepts any department —
// only the automatic name-based resolution is Lima-only during the pilot.
// Next phase: once this expands nationally, remove this filter and add a
// provincia follow-up question for names that are still ambiguous within
// a single departamento.
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

// Tries increasingly loose local strategies — exact match, then prefix
// match — against both the direct reply and the opening-message context,
// evaluating each attempt ALREADY FILTERED TO LIMA before deciding whether
// it "found" something. This matters because an exact match can succeed
// nationally but fail the pilot's scope: "San Juan" is itself an official
// district name in four other regions (none in Lima), so a raw exact match
// finds those and would wrongly conclude "not in Lima" — without this,
// searchDistritoByPrefix never gets a chance to find "San Juan de
// Lurigancho"/"San Juan de Miraflores", which are real Lima districts that
// merely aren't an exact match for "San Juan".
// A district mentioned inside a full sentence ("Quiero una cita en San
// juan") isn't itself an exact match, and isn't a PREFIX of any district
// name either — the sentence's leading words ("Quiero una cita en ")
// aren't part of any real district name, so searchDistritoByPrefix(full
// sentence) never matches even though the sentence clearly names one at
// the end. Unlike the opening free-text message (cleaned by
// analyzeMainMenuIntent into a bare place name before it ever reaches
// here — see handleMainMenuIntentPending), a DIRECT reply to "¿en qué
// distrito buscas atención?" has no such cleanup step, so it leans on the
// AI fallback for phrasing local matching could resolve for free. This
// tries progressively shorter trailing word-groups ("una cita en San
// juan" -> "cita en San juan" -> ... -> "San juan") as exact/prefix keys,
// so the same deterministic dataset match that already works for a bare
// district name also works when it's the tail end of a sentence.
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

function resolveDistritoCandidates(
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
    // Session.slots only holds flat scalar values. The distrito name alone
    // is the title (WhatsApp caps titles at 24 chars); provincia/departamento
    // — the part that actually disambiguates same-named districts — goes in
    // the description instead of being crammed into the title.
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

  // Zero candidates within Lima — either the district is real but outside
  // the pilot's scope, or it was an unrecognized name. Either way this
  // channel doesn't serve it during the pilot: redirect to the national
  // booking site and end the conversation, instead of falling to the
  // manual departamento/provincia/distrito flow (that flow stays reachable
  // from handleUbigeoPending's own fallback, for Lima ubigeos that don't
  // match MINSA's catalog — a different, unrelated failure).
  next.state = "cita_national_redirect";
  return buildResult(next, [
    sendCtaUrl(
      "Por el momento el agendamiento automático por este canal solo está disponible en Lima. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.",
      NATIONAL_REDIRECT_BUTTON_TEXT,
      NATIONAL_REDIRECT_URL,
    ),
  ]);
}

// Thin wrapper around the AI query result — the actual candidate-handling
// logic lives in resolveDistritoCandidates, shared with the local-dataset
// fast path in handleAwaitingDistritoAi above.
function handleDistritoAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { candidates?: DistritoAiCandidateResult[] };
  return resolveDistritoCandidates(session, result.candidates ?? []);
}

function handleAwaitingDistritoDisambiguation(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    includeDescription: true,
    // Text naming none of the offered districts is a corrected district: it
    // goes back through the same dataset -> AI chain the first answer used. A
    // bare "sí"/"ese" names nothing, so it just re-shows the list.
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

// ---- Ubigeo (manual fallback: departamento -> provincia -> distrito) ----

function handleAwaitingDepartamento(session: Session, event: InboundEvent): HandlerResult {
  const departamento = (event.text ?? "").trim();
  if (!departamento) {
    return buildResult(session, [sendText("Indícanos el departamento.")]);
  }

  const next = cloneSession(session);
  next.slots.citaDepartamento = departamento;
  next.state = "cita_awaiting_provincia";
  return buildResult(next, [sendText("¿En qué provincia?")]);
}

function handleAwaitingProvincia(session: Session, event: InboundEvent): HandlerResult {
  const provincia = (event.text ?? "").trim();
  if (!provincia) {
    return buildResult(session, [sendText("Indícanos la provincia.")]);
  }

  const next = cloneSession(session);
  next.slots.citaProvincia = provincia;
  next.state = "cita_awaiting_distrito";
  return buildResult(next, [sendText("¿En qué distrito?")]);
}

function handleAwaitingDistrito(session: Session, event: InboundEvent): HandlerResult {
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

// The one ubigeo that needs no question: the only result, or the only one that
// is exactly the district (and province and department, when known) already
// resolved earlier in the conversation.
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

// Said before the catalog is queried, so the citizen sees their district was
// understood — whether it came from their words, a single match or a list tap.
const searchingCatalogText = (distrito: string) =>
  `Entendido. Buscando especialidades y citas disponibles en *${toDisplayPlace(distrito)}*…`;

function handleUbigeoPending(session: Session, event: QueryResultEvent): HandlerResult {
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

  // A single match doesn't need a list tap — resolve it and keep moving.
  // Only 2+ matches need the citizen to pick one — unless one of them is
  // exactly the district already resolved (MINSA's search is fuzzy, so asking
  // for "San Juan de Lurigancho" can bring back its neighbours too).
  const settled = result.status === "found" && result.items ? pickSettledUbigeo(next, result.items) : undefined;
  if (settled) {
    next.slots.citaUbigeo = settled.ubigeoInei;
    next.state = "cita_especialidad_pending";
    return buildResult(next, [
      sendText(searchingCatalogText(settled.distrito)),
      query("list_especialidades", { ubigeo: settled.ubigeoInei }),
    ]);
  }

  if (
    result.status === "found" &&
    result.items &&
    result.items.length > 1 &&
    result.items.length <= WHATSAPP_LIST_MAX_ROWS
  ) {
    next.state = "cita_awaiting_ubigeo_select";
    const rows: ListRow[] = result.items.map((item) => ({
      id: item.ubigeoInei,
      title: truncateForRow(item.distrito, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.provincia} — ${item.departamento}`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona tu ubigeo:", rows)]);
  }

  // Empty (or errored) ubigeo search, or too many matches to fit WhatsApp's
  // 10-row list cap, re-asks from departamento instead of failing the whole
  // flow — this is the one catalog step that doesn't end the booking on an
  // empty result.
  next.state = "cita_awaiting_departamento";
  return buildResult(next, [
    sendText("No encontramos ese ubigeo. Indícanos nuevamente el departamento."),
  ]);
}

function handleAwaitingUbigeoSelect(session: Session, event: InboundEvent): HandlerResult {
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

// ---- Especialidad --------------------------------------------------------

type EspecialidadResultItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

// Deterministic match against the REAL especialidad list — never a second
// AI call. Only auto-selects when exactly one item matches the hint the
// citizen already typed in their opening message (analyzed by
// analyzeMainMenuIntent in lib/fsm/ai.ts); an ambiguous or absent match
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

function handleEspecialidadPending(session: Session, event: QueryResultEvent): HandlerResult {
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
function handleSelectionHintsPending(session: Session, event: QueryResultEvent): HandlerResult {
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

function handleAwaitingEspecialidadSelect(session: Session, event: InboundEvent): HandlerResult {
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

function handleEstablecimientoPending(session: Session, event: QueryResultEvent): HandlerResult {
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

function handleAwaitingEstablecimientoSelect(session: Session, event: InboundEvent): HandlerResult {
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

function handleFechaPending(session: Session, event: QueryResultEvent): HandlerResult {
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

function todayInLima(): DateParts {
  const fecha = nowInLima().fecha; // YYYYMMDD
  return {
    year: Number(fecha.slice(0, 4)),
    month: Number(fecha.slice(4, 6)),
    day: Number(fecha.slice(6, 8)),
  };
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
function handleFechaAiPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { id?: unknown };
  const offered = readOffered(session.slots);

  const restored = cloneSession(session);
  restored.state = "cita_awaiting_fecha_select";

  if (typeof result.id === "string" && offered?.rows.some((row) => row.id === result.id)) {
    return handleAwaitingFechaSelect(restored, { from: event.from, type: "list", listId: result.id });
  }

  return reshowOffered(restored, offered, `No pudimos identificar esa fecha. ${SELECTION_REJECTION}`);
}

function handleAwaitingFechaSelect(session: Session, event: InboundEvent): HandlerResult {
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

// ---- Hora --------------------------------------------------------------

type HoraResultItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

const HORA_PAGE_NEXT_ID = "hora_pagina_siguiente";
const HORA_PAGE_PREV_ID = "hora_pagina_anterior";

// Peru runs on America/Lima year-round (UTC-5, no DST) — the serverless
// runtime's own local time zone can't be relied on, so this reads Lima's
// wall-clock date/time explicitly via Intl instead of `new Date()`'s
// local getters.
function nowInLima(): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { fecha: `${get("year")}${get("month")}${get("day")}`, hora: `${get("hour")}:${get("minute")}` };
}

// Sorted chronologically and, when the citizen's chosen date is today,
// anchored to the current time — a slot that already started can't be
// booked. Any other (future) date shows the full day from its first slot.
function orderHorasFromNow(citaFecha: string, items: HoraResultItem[]): HoraResultItem[] {
  const sorted = [...items].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const now = nowInLima();
  if (formatFechaForApi(citaFecha) !== now.fecha) return sorted;
  return sorted.filter((item) => item.horaInicio > now.hora);
}

// Shared by handleHoraPending (page 0, computed from the query result it
// already has in hand) and handleHoraPagePending (any page, after
// re-querying list_horas since Session.slots only holds flat scalars, not
// the full candidate array, across turns).
function resolveHoraCandidates(session: Session, items: HoraResultItem[]): HandlerResult {
  const next = cloneSession(session);

  // A lone horario is never booked on its own: booking cannot be quietly undone,
  // and nobody chose this one. It goes through the same confirmation as a typed time.
  if (items.length === 1) {
    const [item] = items;
    return askHoraConfirmation(next, `${item.horaInicio}|${item.horaFin}`, { only: true });
  }

  if (items.length > 1) {
    next.state = "cita_awaiting_hora_select";
    const rows: ListRow[] = items.map((item) => ({
      id: `${item.horaInicio}|${item.horaFin}`,
      title: truncateForRow(`${formatHora12(item.horaInicio)} - ${formatHora12(item.horaFin)}`, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona el horario:", rows)]);
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [sendText("No hay horarios disponibles para esa fecha.")]);
}

// Builds one page (≤10 rows) of an already-ordered candidate list, and
// appends a navigation buttons effect only when there's actually another
// page to move to in either direction — most days fit in one page and get
// no extra message at all.
function buildHoraPage(session: Session, orderedItems: HoraResultItem[], page: number): HandlerResult {
  const start = page * WHATSAPP_LIST_MAX_ROWS;
  const pageItems = orderedItems.slice(start, start + WHATSAPP_LIST_MAX_ROWS);

  const result = resolveHoraCandidates(session, pageItems);
  if (pageItems.length <= 1) return result; // a lone horario to confirm, or genuinely empty — nothing to paginate

  // The whole day's offer (not just this page) so a typed time on another
  // page can still be recognized — see handleAwaitingHoraSelect.
  result.session.slots.citaHorasDia = packHoraSlots(
    orderedItems.map((item) => ({ start: item.horaInicio, end: item.horaFin, cupos: item.cantidadCupos })),
  );

  const hasNext = start + WHATSAPP_LIST_MAX_ROWS < orderedItems.length;
  const hasPrev = page > 0;
  if (!hasNext && !hasPrev) return result;

  result.session.counters.citaHoraPage = page;
  const navButtons = [
    ...(hasPrev ? [{ id: HORA_PAGE_PREV_ID, title: "Horarios anteriores" }] : []),
    ...(hasNext ? [{ id: HORA_PAGE_NEXT_ID, title: "Ver más horarios" }] : []),
  ];
  result.effects.push(sendButtons("¿Quieres ver otros horarios de esta especialidad?", navButtons));
  return result;
}

function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar horarios disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  return buildHoraPage(session, ordered, 0);
}

function handleHoraPagePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar horarios disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  const page = session.counters.citaHoraPage ?? 0;
  return buildHoraPage(session, ordered, page);
}

const HORA_CONFIRM_YES_ID = "hora_confirm_si";
const HORA_CONFIRM_NO_ID = "hora_confirm_no";
// Slots hold flat scalars only: this marks a confirmation of the day's only horario.
const ONLY_HORA_FLAG = "1";

function slotToRow(slot: HoraSlot): OfferedRow {
  return {
    id: `${slot.start}|${slot.end}`,
    title: truncateForRow(`${slot.start} - ${slot.end}`, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${slot.cupos} cupo(s) disponibles`, WHATSAPP_ROW_DESCRIPTION_MAX),
  };
}

function rowToSlot(row: OfferedRow): HoraSlot | undefined {
  const [start, end] = row.id.split("|");
  return /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "")
    ? { start, end, cupos: 0 }
    : undefined;
}

// ---- A bare "1".."10": list position or hour? ------------------------------
// "1" can be option 1 of the list (07:00) or 1 PM (13:00, MINSA speaks 24h).
// Both readings are checked against what is really offered:
//  - only the position exists            -> the position (then confirmed);
//  - only an hour exists ("8", no option 8) -> that hour (then confirmed);
//  - the same slot is both               -> just that slot (then confirmed);
//  - two different slots                 -> a two-button question naming both.
// The tapped button names an exact time, so it books directly like a list tap.

const BARE_SMALL_NUMBER = /^(?:[1-9]|10)$/;
const HORA_CHOICE_A_ID = "hora_choice_a";
const HORA_CHOICE_B_ID = "hora_choice_b";
const BUTTON_TITLE_MAX = 20;

function formatHora12(start: string): string {
  const [hour, minute] = start.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

// "13:00" -> "1 PM" (the hour on its own, for a group of slots).
function formatHourGroup(start: string): string {
  const hour = Number(start.slice(0, 2));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
}

function resolveBareHoraNumber(
  session: Session,
  number: number,
  visibleRows: OfferedRow[],
  daySlots: HoraSlot[],
): CustomMatch | undefined {
  const positionRow = number <= visibleRows.length ? visibleRows[number - 1] : undefined;
  const hourSlots = daySlots.filter((slot) => {
    const hour = Number(slot.start.slice(0, 2));
    return hour === number || hour === number + 12;
  });
  const otherHourSlots = positionRow ? hourSlots.filter((slot) => slotToRow(slot).id !== positionRow.id) : hourSlots;

  if (otherHourSlots.length === 0) {
    // Position only (or the position is itself the sole matching hour); with
    // neither, undefined lets the generic matcher reject it.
    return positionRow ? { kind: "match", row: positionRow } : undefined;
  }

  if (!positionRow) {
    return otherHourSlots.length === 1
      ? { kind: "match", row: slotToRow(otherHourSlots[0]) }
      : { kind: "ambiguous", rows: otherHourSlots.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow) };
  }

  const positionSlot = rowToSlot(positionRow);
  if (!positionSlot) return { kind: "match", row: positionRow };

  const first = otherHourSlots[0];
  const single = otherHourSlots.length === 1;
  const hourLabel = single ? `${formatHora12(first.start)}: ${first.start}` : `${formatHourGroup(first.start)}: ver horas`;
  const hourDescription = single
    ? `${formatHora12(first.start)} (${first.start})`
    : `${formatHourGroup(first.start)} (${otherHourSlots.map((slot) => slot.start).join(", ")})`;

  const next = cloneSession(session);
  next.state = "cita_awaiting_hora_choice";
  next.slots.citaHoraChoiceA = positionRow.id;
  next.slots.citaHoraChoiceB = packHoraSlots(otherHourSlots);

  return {
    kind: "handled",
    result: buildResult(next, [
      sendButtons(`¿A qué te refieres con "${number}"? Opción ${number}: ${positionSlot.start}, o ${hourDescription}.`, [
        { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción ${number}: ${positionSlot.start}`, BUTTON_TITLE_MAX) },
        { id: HORA_CHOICE_B_ID, title: truncateForRow(hourLabel, BUTTON_TITLE_MAX) },
      ]),
    ]),
  };
}

function handleHoraChoice(session: Session, event: InboundEvent): HandlerResult {
  const slotA = String(session.slots.citaHoraChoiceA ?? "");
  const slotsB = unpackHoraSlots(session.slots.citaHoraChoiceB);
  const offered = readOffered(session.slots);

  const back = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraChoiceA;
    delete restored.slots.citaHoraChoiceB;
    restored.state = "cita_awaiting_hora_select";
    return restored;
  };

  // Typing instead of tapping: a normal typed time, read against the full list.
  if (event.type === "text") return handleAwaitingHoraSelect(back(), event);

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;

  if (reply === HORA_CHOICE_A_ID && /^\d{2}:\d{2}\|/.test(slotA)) {
    return startBooking(back(), slotA.split("|")[0]);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length === 1) {
    return startBooking(back(), slotsB[0].start);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length > 1) {
    const restored = back();
    return buildResult(restored, [offerList(restored, NARROWED_LIST_TEXT, slotsB.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow))]);
  }

  // Anything else: ask again with the same two options.
  const [startA] = slotA.split("|");
  const first = slotsB[0];
  if (!/^\d{2}:\d{2}$/.test(startA ?? "") || !first) return reshowOffered(back(), offered);

  return buildResult(session, [
    sendButtons("Elige una de las dos opciones:", [
      { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción: ${startA}`, BUTTON_TITLE_MAX) },
      {
        id: HORA_CHOICE_B_ID,
        title: truncateForRow(slotsB.length === 1 ? `${formatHora12(first.start)}: ${first.start}` : "Ver horas", BUTTON_TITLE_MAX),
      },
    ]),
  ]);
}

// A typed time ("a la 1", "1:45 pm", "en la tarde") is read against the WHOLE
// day MINSA offered; sessions without that (opened before it was stored) fall
// back to the rows currently on screen.
function matchHoraTyped(session: Session, typed: string, rows: OfferedRow[]): CustomMatch | undefined {
  const day = unpackHoraSlots(session.slots.citaHorasDia);
  const slots = day.length > 0 ? day : rows.flatMap((row) => rowToSlot(row) ?? []);

  if (BARE_SMALL_NUMBER.test(typed.trim())) {
    const decided = resolveBareHoraNumber(session, Number(typed.trim()), rows, slots);
    if (decided) return decided;
    // No hour matches: fall through so the generic matcher reads it as a position.
  }

  const match = matchHoraText(typed, slots);
  switch (match.kind) {
    case "exact":
      return { kind: "match", row: slotToRow(match.slot) };
    case "several":
      return { kind: "ambiguous", rows: match.slots.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow) };
    case "unavailable":
      return { kind: "notice", text: "No hay horarios disponibles a esa hora. Elige uno de la lista:" };
    case "unparsed":
      return undefined;
  }
}

// Booking is the one step that can't be quietly undone, so a time that came
// from typed text — or the only one there is — is confirmed first. Tapping a
// list row books directly.
//
// `only` marks "this is the only horario on offer, nobody picked it": the
// question says so, and a "no" has no list of the same day to go back to.
function askHoraConfirmation(session: Session, slotId: string, options: { only?: boolean } = {}): HandlerResult {
  const [start, end] = slotId.split("|");
  const next = cloneSession(session);
  next.state = "cita_awaiting_hora_confirm";
  // citaHoraConfirmId keeps the RAW 24h slot (start|end): it is what gets booked
  // and what startBooking/handleHoraConfirm read back. Only the sentence below
  // is reformatted for the citizen — via formatHora12, in 12h with AM/PM.
  next.slots.citaHoraConfirmId = slotId;
  if (options.only) next.slots.citaHoraConfirmOnly = ONLY_HORA_FLAG;
  else delete next.slots.citaHoraConfirmOnly;

  const range = `${formatHora12(start)} - ${formatHora12(end)}`;
  return buildResult(next, [
    options.only
      ? sendButtons(`Solo hay un horario disponible: ${range}. ¿Lo confirmas?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, gracias" },
        ])
      : sendButtons(`¿Confirmas el horario ${range}?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, ver horarios" },
        ]),
  ]);
}

function startBooking(session: Session, horaInicio: string): HandlerResult {
  const next = clearOffered(session);
  delete next.slots.citaHorasDia;
  delete next.slots.citaHoraConfirmId;
  delete next.slots.citaHoraConfirmOnly;
  delete next.slots.citaHoraChoiceA;
  delete next.slots.citaHoraChoiceB;
  next.state = "cita_booking_pending";
  return buildResult(next, [
    sendText("Agendando tu cita…"),
    query("book_appointment", {
      codigoRenipress: String(next.slots.citaCodEess ?? ""),
      codigoUps: String(next.slots.citaEspecialidadId ?? ""),
      fechaCita: String(next.slots.citaFecha ?? ""),
      horaInicio,
      numeroDocumentoPaciente: String(next.slots.citaDni ?? ""),
    }),
  ]);
}

const NEGATION_WORD = /\b(?:no|ni|nunca|tampoco)\b/;

// The citizen typed the hour that is waiting for confirmation ("a la 1", "13:00")
// or said they take it ("esa hora", "me sirve"). Any negation cancels the reading,
// so "no a la 1" never books.
function acceptsPendingHora(typed: string, slotId: string): boolean {
  const plain = normalizeText(typed).toLowerCase();
  if (NEGATION_WORD.test(plain)) return false;
  if (isSlotAcceptance(typed)) return true;

  const [start, end] = slotId.split("|");
  return matchHoraText(typed, [{ start, end, cupos: 0 }]).kind === "exact";
}

function handleHoraConfirm(session: Session, event: InboundEvent): HandlerResult {
  const slotId = String(session.slots.citaHoraConfirmId ?? "");
  const [start] = slotId.split("|");
  const only = session.slots.citaHoraConfirmOnly === ONLY_HORA_FLAG;
  const offered = readOffered(session.slots);

  const backToList = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraConfirmId;
    delete restored.slots.citaHoraConfirmOnly;

    if (only) {
      // The lone horario was the last page: its list is the previous page's, so
      // the page steps back with it. Without a previous page there is no list of
      // this day to go back to: the citizen is offered another date instead.
      const page = restored.counters.citaHoraPage ?? 0;
      if (!offered || page < 1) return offerOtherFecha(restored);
      restored.counters.citaHoraPage = page - 1;
    }

    restored.state = "cita_awaiting_hora_select";
    return reshowOffered(restored, offered, "Sin problema. Elige otro horario:");
  };

  if (!/^\d{2}:\d{2}$/.test(start ?? "")) return backToList();

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typedText = event.type === "text" ? (event.text ?? "") : "";
  const typed = event.type === "text" ? resolveConfirmation(typedText) : "UNKNOWN";
  const takesThatHora = typed === "UNKNOWN" && event.type === "text" && acceptsPendingHora(typedText, slotId);

  if (reply === HORA_CONFIRM_YES_ID || typed === "YES" || takesThatHora) return startBooking(session, start);
  if (reply === HORA_CONFIRM_NO_ID || typed === "NO") return backToList();

  return withNote(askHoraConfirmation(session, slotId, { only }), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "hora_confirm" },
  });
}

function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    passthroughIds: [HORA_PAGE_NEXT_ID, HORA_PAGE_PREV_ID],
    customMatch: (typed, rows) => matchHoraTyped(session, typed, rows),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === HORA_PAGE_NEXT_ID || replyId === HORA_PAGE_PREV_ID) {
    const next = cloneSession(session);
    const currentPage = next.counters.citaHoraPage ?? 0;
    next.counters.citaHoraPage = Math.max(0, currentPage + (replyId === HORA_PAGE_NEXT_ID ? 1 : -1));
    next.state = "cita_hora_page_pending";
    return buildResult(next, [
      sendText("Buscando más horarios…"),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: String(next.slots.citaFecha ?? ""),
      }),
    ]);
  }

  if (!replyId || !replyId.includes("|")) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  // Typed text (a time or a list position) is confirmed before booking; a tap
  // on a list row is already an explicit choice.
  if (outcome.typed !== undefined) return askHoraConfirmation(session, replyId);

  const [horaInicio] = replyId.split("|");
  return startBooking(session, horaInicio);
}

const MAX_BOOKING_FAILURES = 3;
const SLOT_TAKEN_MESSAGE = /cupo|horario|disponib|agotad|ocupad|tomad/i;

function handleBookingPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; url?: string; message?: string };
  const next = cloneSession(session);

  if (result.status === "unauthorized") {
    // Resumes one step earlier (re-listing horarios) rather than
    // resubmitting the exact same booking blindly — real time passed while
    // re-verifying, so the previously-picked slot might no longer be free.
    return beginReverification(next, "cita_hora_pending");
  }

  if (result.status === "booked") {
    next.state = "cita_booked";
    // Three separate messages — the webhook's send loop already puts a
    // typing indicator + short pause between every effect it sends
    // (app/webhook/whatsapp/route.ts), so this reads as the constancy
    // arriving, a brief pause, the link button, another pause, then a
    // closing message, with no extra delay logic needed here.
    const constanciaText = `*MINISTERIO DE SALUD DEL PERÚ*
*Constancia de Registro de Cita*

Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:
${result.message ?? "Cita creada correctamente"}

Nota: Recuerde acudir a su cita portando su DNI o documento de identidad físico.`;
    return buildResult(next, [
      sendText(constanciaText),
      sendCtaUrl(
        "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):",
        "Ver mi cita", // 11 chars — cta_url's display_text caps at 20
        result.url ?? "",
      ),
      sendText(
        "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita o realizar una consulta, escríbenos nuevamente cuando lo necesites. ¡Que tengas un buen día! 👋",
      ),
    ]);
  }

  if (result.status === "duplicate") {
    next.state = "cita_booking_duplicate";
    return buildResult(next, [
      sendText(result.message ?? "Ya tienes una cita activa registrada."),
    ]);
  }

  // The quota may have been taken a moment before the citizen confirmed (or
  // MINSA answered without saying why). Instead of closing the flow, show the
  // same day's horarios again — bounded, so a systematic failure ends instead
  // of looping. A rejection that states a business reason still closes.
  const failures = (next.counters.citaBookingFailures ?? 0) + 1;
  const slotMayBeGone =
    result.status === "error" ||
    (result.status === "rejected" && (!result.message || SLOT_TAKEN_MESSAGE.test(result.message)));

  if (slotMayBeGone && failures < MAX_BOOKING_FAILURES) {
    next.counters.citaBookingFailures = failures;
    delete next.counters.citaHoraPage;
    next.state = "cita_hora_pending";
    return withNote(buildResult(next, [
      sendText(
        "No pudimos reservar ese horario, puede que otra persona lo haya tomado justo antes. Te muestro los horarios disponibles de la misma fecha:",
      ),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: String(next.slots.citaFecha ?? ""),
      }),
    ]), { kind: "booking_retry", level: "warn", detail: { failures, status: result.status } });
  }

  next.state = "cita_booking_rejected";
  return withNote(
    buildResult(next, [sendText(result.message ?? "No pudimos agendar tu cita. Intenta de nuevo más tarde.")]),
    { kind: "booking_rejected", level: "warn", detail: { failures, status: result.status } },
  );
}
