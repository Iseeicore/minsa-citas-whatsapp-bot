import { isValidDniFormat, isValidOtpFormat, normalizeText } from "./domain";
import {
  buildResult,
  cloneSession,
  query,
  readReply,
  sendText,
  sendList,
  sendButtons,
  sendCtaUrl,
} from "./handlers-shared";
import { searchDistrito, searchDistritoByPrefix } from "./ubigeo-data";
import { formatFechaForApi } from "./minsa";
import type { HandleEvent, HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "./types";

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
    case "cita_especialidad_pending":
      return handleEspecialidadPending(session, event as QueryResultEvent);
    case "cita_awaiting_especialidad_select":
      return handleAwaitingEspecialidadSelect(session, event as InboundEvent);
    case "cita_establecimiento_pending":
      return handleEstablecimientoPending(session, event as QueryResultEvent);
    case "cita_awaiting_establecimiento_select":
      return handleAwaitingEstablecimientoSelect(session, event as InboundEvent);
    case "cita_fecha_pending":
      return handleFechaPending(session, event as QueryResultEvent);
    case "cita_awaiting_fecha_select":
      return handleAwaitingFechaSelect(session, event as InboundEvent);
    case "cita_hora_pending":
      return handleHoraPending(session, event as QueryResultEvent);
    case "cita_hora_page_pending":
      return handleHoraPagePending(session, event as QueryResultEvent);
    case "cita_awaiting_hora_select":
      return handleAwaitingHoraSelect(session, event as InboundEvent);
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
    return buildResult(next, [sendList("Encontramos varias opciones. ¿Cuál es tu distrito?", rows)]);
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
  const replyId = readReply(event);
  const parts = replyId?.split("|");
  if (!parts || parts.length !== 3) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  const [departamento, provincia, distrito] = parts;
  const next = cloneSession(session);
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
  // Only 2+ matches need the citizen to pick one.
  if (result.status === "found" && result.items && result.items.length === 1) {
    const [item] = result.items;
    next.slots.citaUbigeo = item.ubigeoInei;
    next.state = "cita_especialidad_pending";
    return buildResult(next, [
      sendText(
        `Ubigeo encontrado: ${item.distrito} - ${item.provincia} - ${item.departamento}. Buscando especialidades disponibles…`,
      ),
      query("list_especialidades", { ubigeo: item.ubigeoInei }),
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
    return buildResult(next, [sendList("Selecciona tu ubigeo:", rows)]);
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
  const replyId = readReply(event);
  if (!replyId) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  const next = cloneSession(session);
  next.slots.citaUbigeo = replyId;
  next.state = "cita_especialidad_pending";
  return buildResult(next, [
    sendText("Buscando especialidades disponibles…"),
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
    return buildResult(next, [sendList("Selecciona la especialidad:", rows)]);
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [
    sendText("No hay especialidades disponibles en tu zona en este momento."),
  ]);
}

function handleAwaitingEspecialidadSelect(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  if (!replyId) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  const next = cloneSession(session);
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
    next.state = "cita_awaiting_establecimiento_select";
    const rows: ListRow[] = result.items.map((item) => ({
      id: item.renipressCode,
      title: truncateForRow(item.establishmentName, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.quotasOnline} cupo(s) en línea`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [sendList("Selecciona el establecimiento:", rows)]);
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [sendText("No hay establecimientos disponibles para esa especialidad.")]);
}

function handleAwaitingEstablecimientoSelect(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  if (!replyId) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  const next = cloneSession(session);
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

  if (result.status === "found" && result.items && result.items.length === 1) {
    const [item] = result.items;
    next.slots.citaFecha = item.fechaCupo;
    next.state = "cita_hora_pending";
    return buildResult(next, [
      sendText(`Fecha encontrada: ${item.fechaCupo}. Buscando horarios disponibles…`),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: item.fechaCupo,
      }),
    ]);
  }

  if (result.status === "found" && result.items && result.items.length > 1) {
    next.state = "cita_awaiting_fecha_select";
    const rows: ListRow[] = result.items.map((item) => ({
      id: item.fechaCupo,
      title: truncateForRow(item.fechaCupo, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [sendList("Selecciona la fecha:", rows)]);
  }

  next.state = "cita_booking_rejected";
  return buildResult(next, [sendText("No hay fechas disponibles para ese establecimiento.")]);
}

function handleAwaitingFechaSelect(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  if (!replyId) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  const next = cloneSession(session);
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

  if (items.length === 1) {
    const [item] = items;
    next.state = "cita_booking_pending";
    return buildResult(next, [
      sendText(`Horario encontrado: ${item.horaInicio} - ${item.horaFin}. Agendando tu cita…`),
      query("book_appointment", {
        codigoRenipress: String(next.slots.citaCodEess ?? ""),
        codigoUps: String(next.slots.citaEspecialidadId ?? ""),
        fechaCita: String(next.slots.citaFecha ?? ""),
        horaInicio: item.horaInicio,
        numeroDocumentoPaciente: String(next.slots.citaDni ?? ""),
      }),
    ]);
  }

  if (items.length > 1) {
    next.state = "cita_awaiting_hora_select";
    const rows: ListRow[] = items.map((item) => ({
      id: `${item.horaInicio}|${item.horaFin}`,
      title: truncateForRow(`${item.horaInicio} - ${item.horaFin}`, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [sendList("Selecciona el horario:", rows)]);
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
  if (pageItems.length <= 1) return result; // auto-selected or genuinely empty — nothing to paginate

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

function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);

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

  const [horaInicio] = replyId.split("|");
  const next = cloneSession(session);
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

  next.state = "cita_booking_rejected";
  return buildResult(next, [
    sendText(result.message ?? "No pudimos agendar tu cita. Intenta de nuevo más tarde."),
  ]);
}
