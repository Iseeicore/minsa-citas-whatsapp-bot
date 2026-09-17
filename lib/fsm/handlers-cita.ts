import { isValidDniFormat, isValidOtpFormat } from "./domain";
import { buildResult, cloneSession, query, readReply, sendText, sendList } from "./handlers-shared";
import { searchDistrito } from "./ubigeo-data";
import type { HandleEvent, HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "./types";

const MAX_REGISTRATION_CHECKS = 3;
const MAX_OTP_ATTEMPTS = 3;

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
    sendText(
      "Todavía no encontramos tu registro. Este proceso puede tardar unos minutos — escribe CONFIRMAR para intentar de nuevo.",
    ),
  ]);
}

function handleRegistrationWait(session: Session, event: InboundEvent): HandlerResult {
  const isConfirm = (event.text ?? "").trim().toUpperCase() === "CONFIRMAR";

  if (!isConfirm) {
    return buildResult(session, [sendText("Escribe CONFIRMAR cuando quieras que volvamos a intentar.")]);
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

  // Fast, free, deterministic first attempt against the real INEI dataset
  // (lib/fsm/ubigeo-data.ts) before ever spending an AI call. Tries the
  // direct reply first, then the opening-message context if that alone
  // didn't match anything (covers the same "sí, en ese" case the
  // affirmative-reply swap above already covers for the AI path).
  const localCandidates =
    searchDistrito(distritoText).length > 0
      ? searchDistrito(distritoText)
      : contextText
        ? searchDistrito(contextText)
        : [];

  if (localCandidates.length > 0) {
    return resolveDistritoCandidates(session, localCandidates);
  }

  const next = cloneSession(session);
  next.state = "cita_distrito_ai_pending";
  return buildResult(next, [
    sendText("Buscando tu distrito…"),
    query("resolve_distrito_ai", { distritoText, contextText }),
  ]);
}

type DistritoAiCandidateResult = {
  departamento: string;
  provincia: string;
  distrito: string;
};

// Shared by the local-dataset fast path above and the AI-result path below —
// "what do we do with N resolved candidates" is identical either way.
function resolveDistritoCandidates(
  session: Session,
  candidates: DistritoAiCandidateResult[],
): HandlerResult {
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

  // Zero candidates, or the AI call failed/is unavailable — fail-open into
  // the manual 3-question flow instead of blocking a real booking.
  next.state = "cita_awaiting_departamento";
  return buildResult(next, [
    sendText(
      "No pudimos identificar ese distrito automáticamente, vamos a pedirlo por partes. Indícanos el departamento donde buscas atención.",
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

function handleEspecialidadPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: EspecialidadResultItem[] };
  const next = cloneSession(session);

  if (result.status === "found" && result.items && result.items.length === 1) {
    const [item] = result.items;
    next.slots.citaEspecialidadId = item.codigoEspecialidad;
    next.state = "cita_establecimiento_pending";
    return buildResult(next, [
      sendText(`Especialidad encontrada: ${item.nombreEspecialidad}. Buscando establecimientos…`),
      query("list_establecimientos", {
        especialidadId: item.codigoEspecialidad,
        ubigeo: String(next.slots.citaUbigeo ?? ""),
      }),
    ]);
  }

  if (result.status === "found" && result.items && result.items.length > 1) {
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

function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };
  const next = cloneSession(session);

  if (result.status === "found" && result.items && result.items.length === 1) {
    const [item] = result.items;
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

  if (result.status === "found" && result.items && result.items.length > 1) {
    next.state = "cita_awaiting_hora_select";
    const rows: ListRow[] = result.items.map((item) => ({
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

function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
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

  if (result.status === "booked") {
    next.state = "cita_booked";
    return buildResult(next, [
      sendText(`¡Tu cita fue agendada con éxito! ${result.message ?? ""}\n${result.url ?? ""}`.trim()),
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
