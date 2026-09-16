// D13 (design revision 2): `handle()` is a pure, zero-I/O engine dispatching
// through a STATE_HANDLERS registry keyed by state name. Stage B/C add a
// registry entry without ever touching this file's own signature. Purity
// keeps Strict TDD triangulation mock-free — every test below is a plain
// function call, no doubles.
//
// D17: every outbound effect carries `to` explicitly, sourced from the
// in-flight InboundConversationEvent.from held in memory for this job. It is
// NEVER read back out of the persisted session, which does not contain it.
//
// D20 (Stage B, PR4): `FsmEffect` splits into `FsmSendEffect` (Stage A's four
// kinds, byte-identical) and `FsmQueryEffect` (plain data describing an I/O
// call — `handle()` never performs it; conversation-flow.ts's bounded
// re-entry mechanism does, exactly once per turn, never inside this file).
// `event` widens additively to `FsmEvent = InboundConversationEvent |
// FsmSystemEvent`, so every existing STATE_HANDLERS entry keeps its logic
// unchanged and only compiles against the wider type.
//
// PR5 (Phase 5): `FsmQueryEffect`/`FsmSystemEvent` widen further with
// `quejas_submit`/`quejas_submit_result` (deferred from PR4 by design — see
// PR4's apply-progress deviation #2). `QuejaSubmission` (this file) carries
// only the raw submission intent (`celular`/`dni`/`nombreCompleto`/`queja`/
// `mediaId`); the wire payload's `imagen` field (D21, base64/data-URI) and
// the real `QuejasSubmissionClient` HTTP call stay Phase 6/7, D21-gated.
//
// PR6 (Phase 6): `FsmQueryEffect`/`FsmSystemEvent` widen further with
// `validate_user`/`validate_user_result` (deferred from PR4 by design — same
// precedent as `quejas_submit`'s own PR4->PR5 deferral, see 4.6's note in
// tasks.md).
//
// PR7 (Phase 7): `FsmQueryEffect`/`FsmSystemEvent` widen with
// `verify_code`/`verify_code_result`, completing the deferral noted above.
// The OTP states (`cita_awaiting_otp`, `cita_verify_pending`,
// `cita_identity_confirmed`, `cita_otp_locked`) are registered here.
import type { ListRow, ListSection, ReplyButton } from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupResult } from "../ports/reniec-lookup-client.js";
import type { QuejaSubmissionResult } from "../ports/quejas-submission-client.js";
import type { ValidateUserResult, VerifyCodeResult } from "../ports/minsa-identity-client.js";
import type {
  BookAppointmentResult,
  ListEspecialidadesResult,
  ListEstablecimientosResult,
  ListFechasResult,
  ListHorasResult,
  SearchUbigeoResult,
} from "../ports/minsa-catalog-client.js";
import type { UbigeoAiValidationResult } from "../ports/ai-fallback-client.js";
import type { ConversationSession, ConversationStateName, SlotValue } from "./conversation-session.js";
import { withState } from "./conversation-session.js";
import { isValidDniFormat } from "./dni.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";
import { isValidOtpFormat } from "./otp.js";
import { namesMatch } from "./reniec-name-match.js";

export type FsmSendEffect =
  | { kind: "send_text"; to: string; body: string }
  | {
      kind: "send_interactive_list";
      to: string;
      body: string;
      header?: string;
      footer?: string;
      buttonLabel: string;
      sections: readonly ListSection[];
    }
  | { kind: "send_buttons"; to: string; body: string; buttons: readonly ReplyButton[] }
  | { kind: "end_session"; to: string };

// D20: plain data — this file never performs the lookup/submission itself.
/** D20/D17 carried forward: `celular` is built from `event.from` AT
 *  EFFECT-CONSTRUCTION TIME inside the handler that has `event` in scope. It
 *  is NEVER read from `slots`, which does not and must not contain it —
 *  same discipline as `FsmSendEffect.to`. */
export interface QuejaSubmission {
  readonly celular: string;
  /** `null` on the sin-DNI path. */
  readonly dni: string | null;
  readonly nombreCompleto: string | null;
  readonly queja: string;
  /** Meta media handle, resolved by the executor (Phase 6). `null` when the citizen skipped the photo. */
  readonly mediaId: string | null;
}

// D26/D17: `numeroDocumento` is the format-validated DNI text captured by
// `citaAwaitingDniHandler` — never `conversation_id`, which stays
// adapter-owned (design's D26: "never a port parameter and never an FSM
// concern") and is added by `http-minsa-identity-client.ts` (Phase 3) from
// its own injected config, not carried through this effect.
//
// PR7 (Phase 7): `verify_code`'s `twofaId` is read from `slots.citaTwofaId`
// (written by `citaValidatePendingHandler`'s `valid` branch); `code` is the
// format-validated OTP text captured by `citaAwaitingOtpHandler` — same
// discipline as `validate_user`'s `numeroDocumento` above.
export type FsmQueryEffect =
  | { kind: "reniec_lookup"; dni: string }
  | { kind: "quejas_submit"; submission: QuejaSubmission }
  | { kind: "validate_user"; numeroDocumento: string }
  | { kind: "verify_code"; twofaId: string; code: string }
  // Cita catalog/booking MVP (no-SDD fast path, explicit user decision):
  // `token` is `slots.citaBearer`, read by the handler that constructs each
  // effect — same D17 "never from slots inside handle()" discipline covers
  // `to`, not `token` (a Bearer credential, not the citizen's own identity).
  // AI ubigeo pre-check (no-SDD exploration, explicit user decision): fires
  // BEFORE search_ubigeo, so an obvious typo/hierarchy mismatch (e.g.
  // Provincia "Trujillo" under Departamento "Lima") is caught with a
  // specific message instead of wasting a real MINSA call for a generic
  // "not found." No `token` — this never talks to MINSA.
  | { kind: "validate_ubigeo_ai"; departamento: string; provincia: string; distrito: string }
  | { kind: "search_ubigeo"; departamento: string; provincia: string; distrito: string; token: string }
  | { kind: "list_especialidades"; ubigeo: string; token: string }
  | { kind: "list_establecimientos"; ubigeo: string; especialidadId: string; token: string }
  | { kind: "list_fechas"; codEess: string; especialidadId: string; token: string }
  | { kind: "list_horas"; codEess: string; especialidadId: string; fecha: string; token: string }
  | {
      kind: "book_appointment";
      codigoRenipress: string;
      codigoUps: string;
      fechaCita: string;
      horaCita: string;
      numeroDocumentoPaciente: string;
      token: string;
    };

// D28 (Stage C1, PR4): FsmScheduleEffect is a THIRD effect category — plain
// data describing a future timer fire, no I/O performed here. `handle()`
// never arms the timer itself; conversation-flow.ts's schedule executor
// (`runScheduleEffects`, symmetric with `runQueryEffect`) does. Deliberately
// NOT a query effect: it synthesizes no re-entry result event, so folding it
// into FsmQueryEffect would force loosening D20's single-query-effect /
// bounded-re-entry guard for no reason — a schedule effect is legitimate
// even in the re-entry pass (design: "pass 2 legitimately arms wait #2").
export interface FsmScheduleEffect {
  readonly kind: "schedule_check";
  /** Already a D17 digest (session.sessionKey) — safe to carry as plain data. */
  readonly sessionKey: string;
  /** D17: event.from at EFFECT-CONSTRUCTION time — NEVER read from `slots`. */
  readonly to: string;
  readonly delaySeconds: number;
  readonly checkKind: "cita_registration_wait_elapsed";
  /** D31: deterministic ordinal token, e.g. "registro_wait:1" — NEVER crypto.randomUUID() (keeps handle() pure/deterministic). */
  readonly waitToken: string;
  readonly expectedState: ConversationStateName;
}

// Same exported name as Stage A, now a union of THREE effect families.
export type FsmEffect = FsmSendEffect | FsmQueryEffect | FsmScheduleEffect;

export interface FsmResult {
  /** Next state, already advanced — the caller persists this via SessionStore. */
  readonly session: ConversationSession;
  readonly effects: readonly FsmEffect[];
  /** "rejected" is a terminal business stop; Stage A never produces it. */
  readonly outcome: "continue" | "rejected";
}

// D20: synthesized exclusively by conversation-flow.ts after it executes a
// query effect — never by the Meta webhook mapper (inbound-conversation-event.ts).
// `from` mirrors the triggering InboundConversationEvent.from so `event.from`
// keeps compiling identically across the widened FsmEvent union below (both
// variants declare `from?: string`). `result`'s member shapes (`ReniecLookupResult`'s
// "found"/"not_found" vs. `QuejaSubmissionResult`'s "accepted"/"rejected") carry
// disjoint `status` literals, so `result.status === "..."` narrows correctly
// per handler even though this stays one flat interface, not a discriminated
// union keyed on `kind` — same shape the design's D20 contract specifies.
export interface FsmSystemEvent {
  readonly source: "system";
  readonly from?: string;
  readonly kind:
    | "reniec_lookup_result"
    | "quejas_submit_result"
    | "validate_user_result"
    | "verify_code_result"
    | "validate_ubigeo_ai_result"
    | "search_ubigeo_result"
    | "list_especialidades_result"
    | "list_establecimientos_result"
    | "list_fechas_result"
    | "list_horas_result"
    | "book_appointment_result";
  readonly result:
    | ReniecLookupResult
    | QuejaSubmissionResult
    | ValidateUserResult
    | VerifyCodeResult
    | UbigeoAiValidationResult
    | SearchUbigeoResult
    | ListEspecialidadesResult
    | ListEstablecimientosResult
    | ListFechasResult
    | ListHorasResult
    | BookAppointmentResult;
}

// D29 (Stage C1, PR4): a THIRD event source — a scheduled-check timer fire,
// never a citizen message. Synthesizing it as an InboundConversationEvent
// would inflate `counters.messagesReceived` (conversation-flow.ts's
// process()-only increment) and produce a bogus `toLogView` line, which is
// scoped to the "whatsapp" arm only — so it gets its own disjoint source
// instead, exactly like FsmSystemEvent's "system" source above.
export interface FsmScheduleEvent {
  readonly source: "schedule";
  /** Declared so `event.from ?? ""` keeps compiling across the widened FsmEvent union. */
  readonly from?: string;
  readonly kind: "cita_registration_wait_elapsed";
  readonly waitToken: string;
}

// D20/D29: additive widening. Every existing `InboundConversationEvent` call
// site remains assignable to `FsmEvent` — no Stage A/B test changes from
// this widening alone (see conversation-fsm.test.ts, unchanged assertions).
// No existing handler needs a logic change: FsmSystemEvent.kind and
// FsmScheduleEvent.kind are both literal types, so `event.kind !== "..."`
// narrowing in existing handlers still discriminates correctly and still
// compiles against the wider union.
export type FsmEvent = InboundConversationEvent | FsmSystemEvent | FsmScheduleEvent;

/** True for a real Meta-originated event; false for a synthesized system-result event (D20) or a schedule-fired event (D29). */
export function isInboundEvent(event: FsmEvent): event is InboundConversationEvent {
  return event.source === "whatsapp";
}

/** True for a timer-fired event (D29) — false for a real citizen message or a synthesized query-effect result (D20). */
export function isScheduleEvent(event: FsmEvent): event is FsmScheduleEvent {
  return event.source === "schedule";
}

type StateHandler = (session: ConversationSession, event: FsmEvent) => FsmResult;

const MAIN_MENU_STATE: ConversationStateName = "main_menu";
const AWAITING_FLOW_START_STATE: ConversationStateName = "awaiting_flow_start";
const RECLAMO_IDENTITY_CHOICE_STATE: ConversationStateName = "reclamo_identity_choice";

const MAIN_MENU_BODY = "¿En qué podemos ayudarte hoy?";
const MAIN_MENU_BUTTON_LABEL = "Ver opciones";

// PR6 (Phase 6): the Cita branch's real entry point, replacing PR1's
// `CITA_PLACEHOLDER_BODY` stub — design's FSM states table, `awaiting_flow_start`
// row: "replaces CITA_PLACEHOLDER_BODY".
const CITA_AWAITING_DNI_STATE: ConversationStateName = "cita_awaiting_dni";
const CITA_VALIDATE_PENDING_STATE: ConversationStateName = "cita_validate_pending";
const CITA_REGISTRATION_WAIT_STATE: ConversationStateName = "cita_registration_wait";
// Terminal (spec: outcome "rejected" — a second consecutive not_valid MINSA
// check, no third wait).
const CITA_REGISTRATION_REJECTED_STATE: ConversationStateName = "cita_registration_rejected";
// PR7 (Phase 7): now registered in STATE_HANDLERS below (citaAwaitingOtpHandler)
// — was PR6's own placeholder target, unregistered until this PR, same
// precedent as `reclamo_awaiting_descripcion`'s own PR4->PR5 placeholder
// window (Stage B).
const CITA_AWAITING_OTP_STATE: ConversationStateName = "cita_awaiting_otp";
// PR7: D20's re-entry point for the OTP query effect (mirrors
// CITA_VALIDATE_PENDING_STATE).
const CITA_VERIFY_PENDING_STATE: ConversationStateName = "cita_verify_pending";
// PR7: a HOLDING state for C2 (design D33's stated exception — NOT terminal,
// so citaBearer is deliberately retained here rather than cleared).
const CITA_IDENTITY_CONFIRMED_STATE: ConversationStateName = "cita_identity_confirmed";
// PR7: terminal (spec: outcome "rejected" — the 3rd consecutive invalid OTP,
// no further prompt possible).
const CITA_OTP_LOCKED_STATE: ConversationStateName = "cita_otp_locked";

const CITA_ASK_DNI_BODY = "Ingresa tu DNI (8 dígitos).";
const CITA_INVALID_DNI_BODY = "El DNI debe tener exactamente 8 dígitos numéricos. Inténtalo de nuevo.";
const CITA_VALIDATING_BODY = "Estamos validando tus datos…";
const CITA_OTP_SENT_BODY = "Te enviamos un código de verificación.";
const CITA_NOT_REGISTERED_BODY =
  "No encontramos tu registro en MINSA Digital. Regístrate y escribe CONFIRMAR para continuar, " +
  "o espera mientras verificamos automáticamente en unos minutos.";
const CITA_REGISTRATION_REJECTED_BODY =
  "No pudimos verificar tu registro en MINSA Digital. Regístrate desde la aplicación e inténtalo " +
  "nuevamente más tarde.";
const CITA_PROCESSING_BODY = "Estamos procesando tu solicitud, danos un momento.";
const CITA_VERIFYING_REGISTRATION_BODY = "Verificando tu registro…";
const CITA_STILL_VERIFYING_REGISTRATION_BODY = "Seguimos verificando tu registro…";
const CITA_INVALID_WAIT_REPLY_BODY =
  "Escribe CONFIRMAR para verificar tu registro, o espera mientras lo revisamos automáticamente.";
const CITA_CONFIRMAR_PATTERN = /^confirmar$/i;
// PR7: design's FSM states table, `cita_awaiting_otp` row.
const CITA_VALIDATING_CODE_BODY = "Validando el código…";
const CITA_INVALID_OTP_FORMAT_BODY =
  "El código debe tener entre 4 y 8 dígitos numéricos. Inténtalo de nuevo.";
// PR7: `cita_verify_pending`'s `verified` branch — the C2 entry point message
// (design's own literal text).
const CITA_IDENTITY_CONFIRMED_BODY = "Identidad verificada. Estamos preparando la reserva de tu cita.";
// PR7: `cita_identity_confirmed`'s re-prompt on any further inbound message —
// the SAME text PR1's original `CITA_PLACEHOLDER_BODY` stub used (design:
// "re-sends the C2 placeholder, the shape agendar_cita uses today").
const CITA_C2_PLACEHOLDER_BODY = "Estamos preparando la reserva de tu cita. En un momento continuamos.";
// PR7: `cita_verify_pending`'s terminal lockout branch (3rd consecutive
// invalid OTP).
const CITA_OTP_LOCKED_BODY =
  "Superaste el número máximo de intentos. Por tu seguridad, bloqueamos la verificación. " +
  "Vuelve a intentar agendar tu cita más tarde.";

// D31/D32: mirrors config.ts's `citaRegistrationWaitSeconds` default. A pure
// module constant, NOT read from config.ts — `handle()` stays zero-I/O (D13)
// and takes no config parameter (spec's "Pure Transition Engine" requirement
// locks the 2-arg signature). Matches the design's own FSM states table
// literal (`schedule_check{delaySeconds: 300, ...}`) and config.ts's
// `Number(process.env.CITA_REGISTRATION_WAIT_SECONDS ?? 300)` default.
// ⚠️ Accepted, documented D13 consequence: an operator overriding
// CITA_REGISTRATION_WAIT_SECONDS changes worker.ts's boot-time TTL-headroom
// assertion (Phase 5) but NOT this literal — the two must be kept in sync
// manually if the env default is ever changed (see this PR's deviations).
const CITA_REGISTRATION_WAIT_SECONDS = 300;
// Design's FSM states table: the 3rd consecutive not_valid check is
// terminal — two waits (registro_wait:1, registro_wait:2), never a third.
const CITA_MAX_REGISTRATION_CHECKS = 3;
// PR7: design's FSM states table, `cita_verify_pending` row — the 3rd
// consecutive invalid OTP is terminal lockout, mirroring
// CITA_MAX_REGISTRATION_CHECKS's own "3 strikes" shape.
const CITA_MAX_OTP_ATTEMPTS = 3;

// PR7 (task 7.6): extends Phase 6's list with `citaOtpAttempts`/`citaBearer`
// now that the OTP states land — same incremental pattern D33 calls for.
// NOTE: `citaValidatePendingHandler`'s `valid` branch (Phase 6) never wrote
// `citaBearer`, so this extension is additive-only, no prior behavior change.
const CITA_SLOT_KEYS_TO_CLEAR = [
  "citaDni",
  "citaTwofaId",
  "citaWaitToken",
  "citaRegistrationChecks",
  "citaOtpAttempts",
  "citaBearer",
  "citaDepartamento",
  "citaProvincia",
  "citaDistrito",
  "citaUbigeo",
  "citaEspecialidadId",
  "citaCodEess",
  "citaFecha",
  "citaHoraInicio",
] as const;

// --- Cita catalog/booking MVP (no-SDD fast path, explicit user decision) ---
// Ubigeo collection split into 3 sequential guided questions (departamento
// -> provincia -> distrito) instead of one free-text "Depto/Prov/Distrito"
// prompt — explicit UX change from the original Twilio flow's single-text
// format, requested to cut format-parse errors. The real MINSA /ubigeo call
// is unaffected: it already takes all three fields in one POST regardless
// of how many turns it took to collect them.
const CITA_AWAITING_DEPARTAMENTO_STATE: ConversationStateName = "cita_awaiting_departamento";
const CITA_AWAITING_PROVINCIA_STATE: ConversationStateName = "cita_awaiting_provincia";
const CITA_AWAITING_DISTRITO_STATE: ConversationStateName = "cita_awaiting_distrito";
// AI ubigeo pre-check (no-SDD exploration): sits between distrito collection
// and the real MINSA lookup.
const CITA_UBIGEO_AI_PENDING_STATE: ConversationStateName = "cita_ubigeo_ai_pending";
const CITA_UBIGEO_PENDING_STATE: ConversationStateName = "cita_ubigeo_pending";
const CITA_AWAITING_UBIGEO_SELECT_STATE: ConversationStateName = "cita_awaiting_ubigeo_select";
const CITA_ESPECIALIDAD_PENDING_STATE: ConversationStateName = "cita_especialidad_pending";
const CITA_AWAITING_ESPECIALIDAD_SELECT_STATE: ConversationStateName = "cita_awaiting_especialidad_select";
const CITA_ESTABLECIMIENTO_PENDING_STATE: ConversationStateName = "cita_establecimiento_pending";
const CITA_AWAITING_ESTABLECIMIENTO_SELECT_STATE: ConversationStateName = "cita_awaiting_establecimiento_select";
const CITA_FECHA_PENDING_STATE: ConversationStateName = "cita_fecha_pending";
const CITA_AWAITING_FECHA_SELECT_STATE: ConversationStateName = "cita_awaiting_fecha_select";
const CITA_HORA_PENDING_STATE: ConversationStateName = "cita_hora_pending";
const CITA_AWAITING_HORA_SELECT_STATE: ConversationStateName = "cita_awaiting_hora_select";
const CITA_BOOKING_PENDING_STATE: ConversationStateName = "cita_booking_pending";
const CITA_BOOKED_STATE: ConversationStateName = "cita_booked";
const CITA_BOOKING_DUPLICATE_STATE: ConversationStateName = "cita_booking_duplicate";
const CITA_BOOKING_REJECTED_STATE: ConversationStateName = "cita_booking_rejected";

const CITA_ASK_DEPARTAMENTO_BODY = "¿En qué departamento vives? (ej: Lima)";
const CITA_ASK_PROVINCIA_BODY = "¿En qué provincia? (ej: Lima)";
const CITA_ASK_DISTRITO_BODY = "¿En qué distrito? (ej: Lurigancho)";
const CITA_INVALID_UBICACION_STEP_BODY = "No entendí tu respuesta. Escribe el nombre, por favor.";
const CITA_SEARCHING_BODY = "Buscando…";
const CITA_UBIGEO_EMPTY_BODY = "No encontramos esa ubicación. Empecemos de nuevo.";
const CITA_ESPECIALIDADES_EMPTY_BODY = "No hay especialidades con cupos disponibles para esa ubicación por ahora.";
const CITA_ESTABLECIMIENTOS_EMPTY_BODY = "No hay establecimientos disponibles para esa especialidad por ahora.";
const CITA_FECHAS_EMPTY_BODY = "No hay fechas disponibles para ese establecimiento por ahora.";
const CITA_HORAS_EMPTY_BODY = "No hay horarios disponibles para esa fecha por ahora.";
const CITA_BOOKING_BODY = "Agendando tu cita…";
const CITA_BOOKING_DUPLICATE_BODY = "Ya tienes una cita activa en el mismo turno o servicio.";
const CITA_INVALID_SELECTION_BODY = "Esa opción no es válida. Por favor selecciona una de la lista.";

/** MVP helper: builds one interactive-list send effect from a flat option list, truncated to WhatsApp's 24/72 limits. */
function buildListEffect(
  to: string,
  body: string,
  buttonLabel: string,
  options: readonly { id: string; title: string; description?: string }[]
): FsmEffect {
  return {
    kind: "send_interactive_list",
    to,
    body,
    buttonLabel,
    sections: [
      {
        rows: options.map((o) => ({
          id: o.id,
          title: o.title.slice(0, 24),
          ...(o.description !== undefined ? { description: o.description.slice(0, 72) } : {}),
        })),
      },
    ],
  };
}

// D22/D33 discipline, mirroring `clearReclamoSlots` above: delete-based (not
// a destructuring rest-omit) to avoid an unused-binding footgun as more Cita
// slot keys are added in Phase 7. Cita's keys are namespaced apart from
// Reclamo's own (`dni`/`nombre`/`queja`) per D33.
function clearCitaSlots(slots: ConversationSession["slots"]): ConversationSession["slots"] {
  const next: Record<string, SlotValue> = { ...slots };
  for (const key of CITA_SLOT_KEYS_TO_CLEAR) {
    delete next[key];
  }
  return next;
}

// Design's FSM states table, `reclamo_identity_choice` row: the citizen is
// asked whether they want to identify with DNI. Registered below (PR4) —
// PR1/PR2/PR3 left it unregistered, so a reply used to fall back to
// main_menu via D13's registry-fallback guard; this PR replaces that
// fallback with the real con-DNI branch (design's "con DNI" through the
// RENIEC check). PR5 replaces the "sin DNI" placeholder with the real
// shortcut straight into the shared descripción/foto/submit sequence.
const RECLAMO_IDENTITY_CHOICE_BODY = "¿Deseas identificarte con tu DNI?";
const RECLAMO_IDENTITY_CHOICE_BUTTONS: readonly ReplyButton[] = [
  { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
  { id: "reclamo_sin_dni", title: "No tengo DNI" },
];
const RECLAMO_CON_DNI_ID = "reclamo_con_dni";
const RECLAMO_SIN_DNI_ID = "reclamo_sin_dni";

const RECLAMO_AWAITING_DNI_STATE: ConversationStateName = "reclamo_awaiting_dni";
const RECLAMO_AWAITING_NOMBRE_STATE: ConversationStateName = "reclamo_awaiting_nombre";
const RECLAMO_RENIEC_PENDING_STATE: ConversationStateName = "reclamo_reniec_pending";
// PR5: shared by both the con-DNI (post-RENIEC-match) and sin-DNI paths, per
// spec's "Descripción, Foto, and Submission (shared by both paths)".
const RECLAMO_AWAITING_DESCRIPCION_STATE: ConversationStateName = "reclamo_awaiting_descripcion";
const RECLAMO_AWAITING_FOTO_STATE: ConversationStateName = "reclamo_awaiting_foto";
// PR5: D20's second re-entry target — conversation-flow.ts executes the
// `quejas_submit` query effect and re-enters handle() with the synthesized
// result, exactly like `reclamo_reniec_pending` above.
const RECLAMO_SUBMIT_PENDING_STATE: ConversationStateName = "reclamo_submit_pending";
// Terminal (spec: outcome "rejected"). Registered this PR (see
// closedFlowHandler) — previously (PR4) unregistered and relying on D13's
// registry-fallback guard.
const RECLAMO_REJECTED_STATE: ConversationStateName = "reclamo_rejected";
// Terminal (spec: outcome "continue" — a successful submission).
const RECLAMO_CONFIRMED_STATE: ConversationStateName = "reclamo_confirmed";
// Terminal (spec: outcome "rejected" — a quejas-submission rejection, D24).
const RECLAMO_FAILED_STATE: ConversationStateName = "reclamo_failed";

const RECLAMO_ASK_DNI_BODY = "Ingresa tu DNI (8 dígitos).";
const RECLAMO_INVALID_DNI_BODY = "El DNI debe tener exactamente 8 dígitos numéricos. Inténtalo de nuevo.";
// Confirmed against the real production bot's actual prompt (screenshot,
// live chat): "ingresa uno de tus nombres tal como aparece en tu DNI" — NOT
// "nombres y apellidos". This matters beyond wording: namesMatch()'s
// word-set-containment algorithm requires EVERY typed word to appear in the
// RENIEC record, so asking for the FULL name (both apellidos) makes a real,
// correctly-registered citizen more likely to fail on a surname spelling/
// composition they didn't know exactly — the original prompt deliberately
// only asks for one name to keep that risk low (design's own "a single
// correct first name matches" note).
const RECLAMO_ASK_NOMBRE_BODY = "Ingresa uno de tus nombres, tal como aparece en tu DNI.";
const RECLAMO_VERIFYING_BODY = "Estamos verificando tus datos…";
const RECLAMO_PROCESSING_BODY = "Estamos procesando tu solicitud, danos un momento.";
// Design's FSM states table: reached both from the sin-DNI shortcut
// (`reclamo_identity_choice`) and from a confirmed RENIEC match
// (`reclamo_reniec_pending`) — the exact same prompt either way, since both
// paths converge on this one shared state.
const RECLAMO_ASK_DESCRIPCION_BODY = "Describe tu reclamo.";
const RECLAMO_DESCRIPCION_MAX_LENGTH = 1000;
const RECLAMO_INVALID_DESCRIPCION_BODY =
  "La descripción debe tener entre 1 y 1000 caracteres. Inténtalo de nuevo.";
const RECLAMO_ASK_FOTO_BODY = "Envía una foto o escribe OMITIR.";
const RECLAMO_INVALID_FOTO_BODY = "No pudimos reconocer tu respuesta. Envía una foto o escribe OMITIR.";
const RECLAMO_REGISTRANDO_BODY = "Registrando tu reclamo…";
const RECLAMO_CONFIRMED_BODY =
  "Tu reclamo fue registrado exitosamente.\n\nNuestro equipo lo revisará a la brevedad. Gracias por ayudarnos a mejorar el servicio de salud.";
const RECLAMO_FAILED_BODY =
  "No pudimos registrar tu reclamo en este momento. Por favor, inténtalo nuevamente más tarde.";
const RECLAMO_FAILED_MEDIA_TOO_LARGE_BODY =
  "La foto enviada supera el tamaño permitido. Por favor, inténtalo nuevamente con una foto más liviana.";
const RECLAMO_OMITIR_PATTERN = /^omitir$/i;
// Spec: "a WhatsApp rejection message — MUST NOT throw." Reached on RENIEC
// not_found or a confirmed no-name-match.
const RECLAMO_REJECTION_BODY =
  "No pudimos validar tus datos con RENIEC. Verifica tu DNI y tus nombres e inténtalo nuevamente más tarde.";

// D22 (DNI-3): every terminal Reclamo handler clears all four Reclamo slot
// keys, whether or not each was ever actually set — a delete on an absent
// key is a safe no-op, so extending this list ahead of a key being written
// (mediaId is never stored in slots — it is sourced from `event.mediaId` at
// effect-construction time, same discipline as `celular`) costs nothing.
const RECLAMO_SLOT_KEYS_TO_CLEAR = ["dni", "nombre", "queja", "mediaId"] as const;

// D22 (DNI-3): every terminal Reclamo handler clears the Reclamo slots so
// the at-rest window is minutes, not the session TTL. Delete-based (not a
// destructuring rest-omit) to avoid an unused-binding footgun as more slot
// keys are added in Phase 5.
function clearReclamoSlots(slots: ConversationSession["slots"]): ConversationSession["slots"] {
  const next: Record<string, SlotValue> = { ...slots };
  for (const key of RECLAMO_SLOT_KEYS_TO_CLEAR) {
    delete next[key];
  }
  return next;
}

// Spec: "main_menu MUST, on a recognized inbound event, emit an effect to
// send an interactive list with agendar_cita and registrar_reclamo." These
// two ids are the only recognized selections for this stage.
const MAIN_MENU_OPTIONS: readonly ListRow[] = [
  { id: "agendar_cita", title: "Agendar cita" },
  { id: "registrar_reclamo", title: "Registrar un reclamo" },
];

function mainMenuListEffect(to: string): FsmEffect {
  return {
    kind: "send_interactive_list",
    to,
    body: MAIN_MENU_BODY,
    buttonLabel: MAIN_MENU_BUTTON_LABEL,
    sections: [{ rows: MAIN_MENU_OPTIONS }],
  };
}

// Design: "a list reply whose id matches persists slots.menuChoice and
// advances to awaiting_flow_start (a terminal placeholder — it does not
// enter Reclamo/Cita); an unmatched reply increments counters.invalidAttempts
// and re-prompts." Task 6.8: `event.interactiveReplyId` (a real WhatsApp
// interactive list/button reply id, per inbound-conversation-event.ts) is
// checked FIRST — that is the shape a real Meta payload sends for a menu
// tap. `event.text` remains the fallback so a plain-text reply that happens
// to match an option id (or a test fixture) still works.
// D23 / D13: awaiting_flow_start's real branch point (Phase 2). Stage A left
// this state unregistered, so an unknown/unregistered state silently fell
// back to main_menu — a session parked here never hit undefined behavior,
// but the citizen also never got a reply for their menu tap (PR1 fixed
// that with a placeholder; this PR replaces the Reclamo half with the real
// transition). Branches on the RECORDED session.slots.menuChoice (never on
// `event`, which may be an unrelated later message once the session is
// already parked in this state).
function awaitingFlowStartHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  if (session.slots.menuChoice === "registrar_reclamo") {
    const advanced = withState(session, RECLAMO_IDENTITY_CHOICE_STATE);
    return {
      session: advanced,
      effects: [
        {
          kind: "send_buttons",
          to,
          body: RECLAMO_IDENTITY_CHOICE_BODY,
          buttons: RECLAMO_IDENTITY_CHOICE_BUTTONS,
        },
      ],
      outcome: "continue",
    };
  }

  if (session.slots.menuChoice === "agendar_cita") {
    // PR6 (Phase 6): the real Cita entry point, replacing PR1's placeholder
    // stub — design's FSM states table, `awaiting_flow_start` row.
    const advanced = withState(session, CITA_AWAITING_DNI_STATE);
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: CITA_ASK_DNI_BODY }],
      outcome: "continue",
    };
  }

  // Defensive fallback: mainMenuHandler only ever records one of the two
  // known option ids before tail-calling here, so this branch should be
  // unreachable in practice — but a corrupted/manually-constructed session
  // must still never crash. Re-prompt with the main menu instead of
  // silently guessing a branch, same discipline as mainMenuHandler's own
  // unmatched path.
  const rePrompted: ConversationSession = {
    ...session,
    counters: {
      ...session.counters,
      invalidAttempts: session.counters.invalidAttempts + 1,
    },
  };

  return { session: rePrompted, effects: [mainMenuListEffect(to)], outcome: "continue" };
}

function mainMenuHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  const matchedOption = MAIN_MENU_OPTIONS.find((option) => option.id === selection);

  if (matchedOption !== undefined) {
    const advanced = withState(
      { ...session, slots: { ...session.slots, menuChoice: matchedOption.id } },
      AWAITING_FLOW_START_STATE
    );
    // D23: tail-call in the SAME turn so a menu tap gets an immediate reply
    // instead of the empty-effects turn Stage A shipped. No recursion risk:
    // awaitingFlowStartHandler never calls back into mainMenuHandler.
    return awaitingFlowStartHandler(advanced, event);
  }

  // Unrecognized event: re-prompt, never crash, and do NOT advance state.
  // Spec: "invalidAttempts increments by 1 and currentState is unchanged."
  // Only counters change here — updatedAt is intentionally left untouched
  // (unlike withState) so repeated calls with identical inputs stay
  // deterministic, per the "Deterministic transition" spec scenario.
  const rePrompted: ConversationSession = {
    ...session,
    counters: {
      ...session.counters,
      invalidAttempts: session.counters.invalidAttempts + 1,
    },
  };

  return { session: rePrompted, effects: [mainMenuListEffect(to)], outcome: "continue" };
}

// Design's FSM states table, `reclamo_identity_choice` row. `reclamo_con_dni`
// advances into the real DNI-capture sequence (PR4); `reclamo_sin_dni`
// (PR5) skips identification entirely per spec's "Reclamo sin DNI — Direct
// Capture" requirement, sharing the same descripción/foto/submit sequence
// as the con-DNI path from that point on (no dni/nombre slots are ever
// written on this branch). Any other reply re-prompts, per spec's "Invalid
// Input Re-Prompt Discipline".
function reclamoIdentityChoiceHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;

  if (selection === RECLAMO_CON_DNI_ID) {
    const advanced = withState(session, RECLAMO_AWAITING_DNI_STATE);
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_DNI_BODY }],
      outcome: "continue",
    };
  }

  if (selection === RECLAMO_SIN_DNI_ID) {
    // Spec's sin-DNI shortcut: straight into the shared descripción-capture
    // state, no dni/nombre/RENIEC step ever entered.
    const advanced = withState(session, RECLAMO_AWAITING_DESCRIPCION_STATE);
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_DESCRIPCION_BODY }],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [
      {
        kind: "send_buttons",
        to,
        body: RECLAMO_IDENTITY_CHOICE_BODY,
        buttons: RECLAMO_IDENTITY_CHOICE_BUTTONS,
      },
    ],
    outcome: "continue",
  };
}

// Spec (identity-verification / DNI Format Validation): format-validated via
// the pure isValidDniFormat BEFORE any RENIEC call — an invalid format never
// emits a reniec_lookup effect, it just re-prompts.
function reclamoAwaitingDniHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text : undefined;

  if (isValidDniFormat(text)) {
    const dni = (text as string).trim();
    const advanced = withState({ ...session, slots: { ...session.slots, dni } }, RECLAMO_AWAITING_NOMBRE_STATE);
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_NOMBRE_BODY }],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: RECLAMO_INVALID_DNI_BODY }],
    outcome: "continue",
  };
}

// Design's FSM states table, `reclamo_awaiting_nombre` row: "any text ->
// reclamo_reniec_pending", emitting BOTH the "verificando" send_text AND the
// reniec_lookup query effect (D20) in the same turn — handle() returns the
// query effect as inert data; conversation-flow.ts executes it.
function reclamoAwaitingNombreHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;

  if (text === undefined || text.length === 0) {
    const rePrompted: ConversationSession = {
      ...session,
      counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
    };
    return {
      session: rePrompted,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_NOMBRE_BODY }],
      outcome: "continue",
    };
  }

  const dni = typeof session.slots.dni === "string" ? session.slots.dni : "";
  const advanced = withState(
    { ...session, slots: { ...session.slots, nombre: text } },
    RECLAMO_RENIEC_PENDING_STATE
  );

  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: RECLAMO_VERIFYING_BODY },
      { kind: "reniec_lookup", dni },
    ],
    outcome: "continue",
  };
}

// D20's re-entry point: this handler is invoked TWICE across a con-DNI
// RENIEC turn — once (defensively) if a stray inbound event ever lands here
// (pending states are never persisted, per D20, so this should not happen in
// production), and once for real with the synthesized FsmSystemEvent
// conversation-flow.ts feeds back after executing the reniec_lookup effect.
// Spec: a no-match/not_found result "MUST NOT throw" — it is a normal
// transition to a rejection/closure state.
function reclamoReniecPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  if (isInboundEvent(event)) {
    return {
      session,
      effects: [{ kind: "send_text", to, body: RECLAMO_PROCESSING_BODY }],
      outcome: "continue",
    };
  }

  if (event.kind !== "reniec_lookup_result") {
    // Defensive: conversation-flow.ts only ever synthesizes the system-event
    // kind that matches the query effect THIS state itself emitted, so a
    // foreign kind should never reach here. Never crash regardless.
    return {
      session,
      effects: [{ kind: "send_text", to, body: RECLAMO_PROCESSING_BODY }],
      outcome: "continue",
    };
  }

  const result = event.result;
  const nombre = typeof session.slots.nombre === "string" ? session.slots.nombre : "";
  const matched = result.status === "found" && namesMatch(nombre, result);

  if (matched) {
    const advanced = withState(session, RECLAMO_AWAITING_DESCRIPCION_STATE);
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_DESCRIPCION_BODY }],
      outcome: "continue",
    };
  }

  // No match, or not_found: a normal transition to a closure state with a
  // WhatsApp reply — spec: "MUST NOT throw." D22 (DNI-3): clear the Reclamo
  // slots at this terminal handler.
  const rejected = withState({ ...session, slots: clearReclamoSlots(session.slots) }, RECLAMO_REJECTED_STATE);

  return {
    session: rejected,
    effects: [
      { kind: "send_text", to, body: RECLAMO_REJECTION_BODY },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

// Design's FSM states table, `reclamo_awaiting_descripcion` row — shared by
// both the sin-DNI shortcut and the post-RENIEC-match con-DNI path (spec:
// "Descripción, Foto, and Submission (shared by both paths)"). Replaces
// PR4's explicit placeholder.
function reclamoAwaitingDescripcionHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;

  if (text !== undefined && text.length >= 1 && text.length <= RECLAMO_DESCRIPCION_MAX_LENGTH) {
    const advanced = withState(
      { ...session, slots: { ...session.slots, queja: text } },
      RECLAMO_AWAITING_FOTO_STATE
    );
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: RECLAMO_ASK_FOTO_BODY }],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: RECLAMO_INVALID_DESCRIPCION_BODY }],
    outcome: "continue",
  };
}

/** D17/D22: `celular` is `event.from` at effect-construction time — NEVER read from `slots`. */
function buildQuejaSubmission(session: ConversationSession, celular: string, mediaId: string | null): QuejaSubmission {
  const dni = typeof session.slots.dni === "string" ? session.slots.dni : null;
  const nombreCompleto = typeof session.slots.nombre === "string" ? session.slots.nombre : null;
  const queja = typeof session.slots.queja === "string" ? session.slots.queja : "";
  return { celular, dni, nombreCompleto, queja, mediaId };
}

// Design's FSM states table, `reclamo_awaiting_foto` row: a captured
// `mediaId` OR a literal "OMITIR" reply both advance to
// `reclamo_submit_pending`, emitting BOTH the "registrando" send_text AND
// the `quejas_submit` query effect (D20) in the same turn — plain inert
// data, `handle()` performs no I/O. Spec scenario "Foto without image":
// anything else re-prompts, no `quejas_submit` effect emitted.
function reclamoAwaitingFotoHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const mediaId = isInboundEvent(event) ? event.mediaId : undefined;
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;
  const hasMedia = typeof mediaId === "string" && mediaId.length > 0;
  const skippedPhoto = text !== undefined && RECLAMO_OMITIR_PATTERN.test(text);

  if (hasMedia || skippedPhoto) {
    const submission = buildQuejaSubmission(session, to, hasMedia ? (mediaId as string) : null);
    const advanced = withState(session, RECLAMO_SUBMIT_PENDING_STATE);
    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body: RECLAMO_REGISTRANDO_BODY },
        { kind: "quejas_submit", submission },
      ],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: RECLAMO_INVALID_FOTO_BODY }],
    outcome: "continue",
  };
}

// D20's second re-entry target (mirrors `reclamoReniecPendingHandler`
// above). Spec: submission success -> confirmation state with a
// confirmation message; D24: a quejas rejection is a normal transition to a
// closure state with a WhatsApp reply, never a thrown error. D22/DNI-3:
// both terminal branches clear the Reclamo slots.
function reclamoSubmitPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  if (isInboundEvent(event) || event.kind !== "quejas_submit_result") {
    // Defensive: pending states are never persisted, and conversation-flow.ts
    // only ever synthesizes the system-event kind matching the query effect
    // THIS state itself emitted — same defensive discipline as
    // reclamoReniecPendingHandler. Never crash regardless.
    return {
      session,
      effects: [{ kind: "send_text", to, body: RECLAMO_PROCESSING_BODY }],
      outcome: "continue",
    };
  }

  const result = event.result;

  if (result.status === "accepted") {
    const confirmed = withState({ ...session, slots: clearReclamoSlots(session.slots) }, RECLAMO_CONFIRMED_STATE);
    return {
      session: confirmed,
      effects: [
        { kind: "send_text", to, body: RECLAMO_CONFIRMED_BODY },
        { kind: "end_session", to },
      ],
      outcome: "continue",
    };
  }

  if (result.status === "rejected") {
    const failed = withState({ ...session, slots: clearReclamoSlots(session.slots) }, RECLAMO_FAILED_STATE);
    const body = result.reason === "media_too_large" ? RECLAMO_FAILED_MEDIA_TOO_LARGE_BODY : RECLAMO_FAILED_BODY;
    return {
      session: failed,
      effects: [
        { kind: "send_text", to, body },
        { kind: "end_session", to },
      ],
      outcome: "rejected",
    };
  }

  // Defensive: unreachable given QuejaSubmissionResult's exhaustive status
  // union, but a foreign/malformed result must never crash the worker.
  return {
    session,
    effects: [{ kind: "send_text", to, body: RECLAMO_PROCESSING_BODY }],
    outcome: "continue",
  };
}

// PR6 (Phase 6): design's FSM states table, `cita_awaiting_dni` row.
// Format-validated via the SAME pure `isValidDniFormat` Reclamo's DNI state
// uses (D13's shared pure helper) BEFORE any `validate_user` query effect —
// an invalid format never emits one, it just re-prompts.
function citaAwaitingDniHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text : undefined;

  if (isValidDniFormat(text)) {
    const dni = (text as string).trim();
    const advanced = withState(
      { ...session, slots: { ...session.slots, citaDni: dni } },
      CITA_VALIDATE_PENDING_STATE
    );
    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body: CITA_VALIDATING_BODY },
        { kind: "validate_user", numeroDocumento: dni },
      ],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: CITA_INVALID_DNI_BODY }],
    outcome: "continue",
  };
}

// PR6: D20's re-entry point for the Cita branch (mirrors
// `reclamoReniecPendingHandler`). Also the SAME handler both exits out of
// `cita_registration_wait` transition into (design: "both exits converge on
// the same target state, effect, and counter"). Spec: a `not_valid` result
// "MUST NOT throw" — it is a normal transition to a wait or a rejection
// state, never a crash.
function citaValidatePendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  if (isInboundEvent(event) || event.kind !== "validate_user_result") {
    // Defensive: pending states are never persisted, and conversation-flow.ts
    // only ever synthesizes the system-event kind matching the query effect
    // THIS state itself emitted — same defensive discipline as
    // reclamoReniecPendingHandler/reclamoSubmitPendingHandler. Never crash.
    return {
      session,
      effects: [{ kind: "send_text", to, body: CITA_PROCESSING_BODY }],
      outcome: "continue",
    };
  }

  const result = event.result;

  if (result.status === "valid") {
    const advanced = withState(
      { ...session, slots: { ...session.slots, citaTwofaId: result.twofaId } },
      CITA_AWAITING_OTP_STATE
    );
    return {
      session: advanced,
      effects: [{ kind: "send_text", to, body: CITA_OTP_SENT_BODY }],
      outcome: "continue",
    };
  }

  // not_valid: design's FSM states table — `n = (citaRegistrationChecks ??
  // 0) + 1`. n < 3 arms a wait (registro_wait:1, then registro_wait:2);
  // n === 3 is terminal, no third wait.
  const previousChecks =
    typeof session.slots.citaRegistrationChecks === "number" ? session.slots.citaRegistrationChecks : 0;
  const checkNumber = previousChecks + 1;

  if (checkNumber >= CITA_MAX_REGISTRATION_CHECKS) {
    const rejected = withState(
      { ...session, slots: clearCitaSlots(session.slots) },
      CITA_REGISTRATION_REJECTED_STATE
    );
    return {
      session: rejected,
      effects: [
        { kind: "send_text", to, body: CITA_REGISTRATION_REJECTED_BODY },
        { kind: "end_session", to },
      ],
      outcome: "rejected",
    };
  }

  const waitToken = `registro_wait:${checkNumber}`;
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaRegistrationChecks: checkNumber, citaWaitToken: waitToken } },
    CITA_REGISTRATION_WAIT_STATE
  );

  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_NOT_REGISTERED_BODY },
      {
        kind: "schedule_check",
        // D17: `session.sessionKey` — already a D17 digest, safe plain data.
        sessionKey: session.sessionKey,
        // D17: `event.from` at effect-construction time — NEVER from `slots`.
        to,
        delaySeconds: CITA_REGISTRATION_WAIT_SECONDS,
        checkKind: "cita_registration_wait_elapsed",
        waitToken,
        expectedState: CITA_REGISTRATION_WAIT_STATE,
      },
    ],
    outcome: "continue",
  };
}

// PR6: design's FSM states table, `cita_registration_wait` row. Both exits —
// an early citizen "CONFIRMAR" reply and the scheduled timer fire — converge
// on the IDENTICAL next state, effect, and counter (D31): whichever wins
// clears `citaWaitToken`, so the LOSER becomes a provable no-op at
// `processScheduled()`'s D31 state-and-token guard when it eventually fires.
// Any OTHER inbound message leaves `citaWaitToken` intact so the still-armed
// timer survives an unrelated message (design: "the armed timer survives an
// unrelated message").
function citaRegistrationWaitHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  const isConfirmarReply =
    isInboundEvent(event) && event.text !== undefined && CITA_CONFIRMAR_PATTERN.test(event.text.trim());
  const isScheduledFire = isScheduleEvent(event) && event.kind === "cita_registration_wait_elapsed";

  if (isConfirmarReply || isScheduledFire) {
    const slots: Record<string, SlotValue> = { ...session.slots };
    delete slots.citaWaitToken;
    const dni = typeof session.slots.citaDni === "string" ? session.slots.citaDni : "";
    const advanced = withState({ ...session, slots }, CITA_VALIDATE_PENDING_STATE);
    const body = isConfirmarReply ? CITA_VERIFYING_REGISTRATION_BODY : CITA_STILL_VERIFYING_REGISTRATION_BODY;

    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body },
        { kind: "validate_user", numeroDocumento: dni },
      ],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: CITA_INVALID_WAIT_REPLY_BODY }],
    outcome: "continue",
  };
}

// PR7 (Phase 7): design's FSM states table, `cita_awaiting_otp` row.
// Format-validated via `isValidOtpFormat` (D13's pure helper, mirrors
// `citaAwaitingDniHandler`'s own discipline) BEFORE any `verify_code` query
// effect — an invalid format never emits one, it just re-prompts. Task 7.2:
// a format miss increments ONLY `invalidAttempts`, never `citaOtpAttempts` —
// that counter is reserved for a REAL MINSA-rejected code (design: "format
// fails -> invalidAttempts++ only — does NOT burn an OTP attempt").
function citaAwaitingOtpHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text : undefined;

  if (isValidOtpFormat(text)) {
    const code = (text as string).trim();
    const twofaId = typeof session.slots.citaTwofaId === "string" ? session.slots.citaTwofaId : "";
    const advanced = withState(session, CITA_VERIFY_PENDING_STATE);
    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body: CITA_VALIDATING_CODE_BODY },
        { kind: "verify_code", twofaId, code },
      ],
      outcome: "continue",
    };
  }

  const rePrompted: ConversationSession = {
    ...session,
    counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
  };

  return {
    session: rePrompted,
    effects: [{ kind: "send_text", to, body: CITA_INVALID_OTP_FORMAT_BODY }],
    outcome: "continue",
  };
}

// PR7: D20's re-entry point for the OTP query effect (mirrors
// `citaValidatePendingHandler`). Spec: an `invalid` result "MUST NOT throw"
// — it is a normal transition to a re-prompt or a lockout state, never a
// crash.
function citaVerifyPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";

  if (isInboundEvent(event) || event.kind !== "verify_code_result") {
    // Defensive: pending states are never persisted, and conversation-flow.ts
    // only ever synthesizes the system-event kind matching the query effect
    // THIS state itself emitted — same defensive discipline as
    // citaValidatePendingHandler. Never crash regardless.
    return {
      session,
      effects: [{ kind: "send_text", to, body: CITA_PROCESSING_BODY }],
      outcome: "continue",
    };
  }

  const result = event.result;

  if (result.status === "verified") {
    // D33: clear every Cita slot key FIRST, then re-add citaBearer — the
    // holding state (cita_identity_confirmed) deliberately keeps it until
    // session TTL, the one stated exception to "every terminal handler
    // clears the bearer". MVP addition (no-SDD fast path): citaDni is ALSO
    // retained here — the booking call (numero_documento_paciente) needs it
    // again downstream in the catalog chain, same documented exception.
    // MVP fix: the catalog chain (C2) already exists, so there is no reason
    // to make the citizen send a throwaway message before seeing the first
    // ubicación prompt — go straight to CITA_AWAITING_DEPARTAMENTO_STATE in
    // the same turn and send both messages together. `cita_identity_confirmed`
    // stays registered in STATE_HANDLERS (citaIdentityConfirmedHandler) only
    // as a defensive fallback for any session already parked there before
    // this fix shipped.
    const advanced = withState(
      {
        ...session,
        slots: {
          ...clearCitaSlots(session.slots),
          citaBearer: result.token,
          citaDni: typeof session.slots.citaDni === "string" ? session.slots.citaDni : "",
        },
      },
      CITA_AWAITING_DEPARTAMENTO_STATE
    );
    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body: CITA_IDENTITY_CONFIRMED_BODY },
        { kind: "send_text", to, body: CITA_ASK_DEPARTAMENTO_BODY },
      ],
      outcome: "continue",
    };
  }

  // invalid: design's FSM states table — `n = (citaOtpAttempts ?? 0) + 1`.
  // n < 3 re-prompts at cita_awaiting_otp; n === 3 is terminal lockout, no
  // further OTP prompt possible (spec: "3-Attempt Lockout").
  const previousAttempts =
    typeof session.slots.citaOtpAttempts === "number" ? session.slots.citaOtpAttempts : 0;
  const attemptNumber = previousAttempts + 1;

  if (attemptNumber >= CITA_MAX_OTP_ATTEMPTS) {
    const locked = withState({ ...session, slots: clearCitaSlots(session.slots) }, CITA_OTP_LOCKED_STATE);
    return {
      session: locked,
      effects: [
        { kind: "send_text", to, body: CITA_OTP_LOCKED_BODY },
        { kind: "end_session", to },
      ],
      outcome: "rejected",
    };
  }

  const remainingAttempts = CITA_MAX_OTP_ATTEMPTS - attemptNumber;
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaOtpAttempts: attemptNumber } },
    CITA_AWAITING_OTP_STATE
  );

  return {
    session: advanced,
    effects: [{ kind: "send_text", to, body: `Código incorrecto. Te quedan ${remainingAttempts} intentos.` }],
    outcome: "continue",
  };
}

// MVP (no-SDD fast path): `cita_identity_confirmed` now actually starts the
// catalog chain on the first inbound message, instead of re-sending the C2
// placeholder forever. `citaBearer`/`citaDni` are already in `slots` from
// `citaVerifyPendingHandler`'s `verified` branch.
function citaIdentityConfirmedHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (!isInboundEvent(event)) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_C2_PLACEHOLDER_BODY }], outcome: "continue" };
  }
  const advanced = withState(session, CITA_AWAITING_DEPARTAMENTO_STATE);
  return {
    session: advanced,
    effects: [{ kind: "send_text", to, body: CITA_ASK_DEPARTAMENTO_BODY }],
    outcome: "continue",
  };
}

function citaBearerOf(session: ConversationSession): string {
  return typeof session.slots.citaBearer === "string" ? session.slots.citaBearer : "";
}
function citaDniOf(session: ConversationSession): string {
  return typeof session.slots.citaDni === "string" ? session.slots.citaDni : "";
}
function stringSlot(session: ConversationSession, key: string): string {
  const v = session.slots[key];
  return typeof v === "string" ? v : "";
}

// MVP: ubigeo collection split into 3 guided steps (departamento -> provincia
// -> distrito) instead of one free-text "Depto/Prov/Distrito" line — each
// step just stores its own slot and asks the next question; only the last
// step actually fires the search_ubigeo query effect with all three.
function citaAwaitingDepartamentoHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;

  if (text === undefined || text.length === 0) {
    const rePrompted: ConversationSession = {
      ...session,
      counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
    };
    return {
      session: rePrompted,
      effects: [{ kind: "send_text", to, body: CITA_INVALID_UBICACION_STEP_BODY }],
      outcome: "continue",
    };
  }

  const advanced = withState(
    { ...session, slots: { ...session.slots, citaDepartamento: text } },
    CITA_AWAITING_PROVINCIA_STATE
  );
  return {
    session: advanced,
    effects: [{ kind: "send_text", to, body: CITA_ASK_PROVINCIA_BODY }],
    outcome: "continue",
  };
}

function citaAwaitingProvinciaHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;

  if (text === undefined || text.length === 0) {
    const rePrompted: ConversationSession = {
      ...session,
      counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
    };
    return {
      session: rePrompted,
      effects: [{ kind: "send_text", to, body: CITA_INVALID_UBICACION_STEP_BODY }],
      outcome: "continue",
    };
  }

  const advanced = withState(
    { ...session, slots: { ...session.slots, citaProvincia: text } },
    CITA_AWAITING_DISTRITO_STATE
  );
  return {
    session: advanced,
    effects: [{ kind: "send_text", to, body: CITA_ASK_DISTRITO_BODY }],
    outcome: "continue",
  };
}

function citaAwaitingDistritoHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const text = isInboundEvent(event) ? event.text?.trim() : undefined;

  if (text === undefined || text.length === 0) {
    const rePrompted: ConversationSession = {
      ...session,
      counters: { ...session.counters, invalidAttempts: session.counters.invalidAttempts + 1 },
    };
    return {
      session: rePrompted,
      effects: [{ kind: "send_text", to, body: CITA_INVALID_UBICACION_STEP_BODY }],
      outcome: "continue",
    };
  }

  const departamento = stringSlot(session, "citaDepartamento");
  const provincia = stringSlot(session, "citaProvincia");
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaDistrito: text } },
    CITA_UBIGEO_AI_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      { kind: "validate_ubigeo_ai", departamento, provincia, distrito: text },
    ],
    outcome: "continue",
  };
}

// AI ubigeo pre-check (no-SDD exploration, explicit user decision): D20
// re-entry target for `validate_ubigeo_ai`. "valid" AND "unavailable" both
// proceed to the real search_ubigeo call (fail-open — an AI outage must
// never block a real citizen); only "flagged" re-prompts with the AI's own
// detalle/sugerencia, restarting collection from departamento (the
// inconsistency could be in any of the three fields).
function citaUbigeoAiPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "validate_ubigeo_ai_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }

  const result = event.result;
  if (result.status === "ubigeo_ai_flagged") {
    const back = withState(session, CITA_AWAITING_DEPARTAMENTO_STATE);
    const sugerenciaLine = result.sugerencia !== undefined ? ` ${result.sugerencia}` : "";
    return {
      session: back,
      effects: [
        { kind: "send_text", to, body: `${result.detalle}${sugerenciaLine}` },
        { kind: "send_text", to, body: CITA_ASK_DEPARTAMENTO_BODY },
      ],
      outcome: "continue",
    };
  }

  // "ubigeo_ai_valid" or "ubigeo_ai_unavailable" — proceed unchanged.
  const departamento = stringSlot(session, "citaDepartamento");
  const provincia = stringSlot(session, "citaProvincia");
  const distrito = stringSlot(session, "citaDistrito");
  const advanced = withState(session, CITA_UBIGEO_PENDING_STATE);
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      { kind: "search_ubigeo", departamento, provincia, distrito, token: citaBearerOf(session) },
    ],
    outcome: "continue",
  };
}

function citaUbigeoPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "search_ubigeo_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  if (result.status === "ubigeo_found") {
    const advanced = withState(session, CITA_AWAITING_UBIGEO_SELECT_STATE);
    return {
      session: advanced,
      effects: [
        buildListEffect(
          to,
          "Selecciona tu ubicación:",
          "Ver opciones",
          result.options.map((o) => ({
            id: o.ubigeoInei,
            title: `${o.distrito}, ${o.provincia}`,
            description: `${o.provincia}, ${o.departamento}`,
          }))
        ),
      ],
      outcome: "continue",
    };
  }
  const back = withState(session, CITA_AWAITING_DEPARTAMENTO_STATE);
  return {
    session: back,
    effects: [
      { kind: "send_text", to, body: CITA_UBIGEO_EMPTY_BODY },
      { kind: "send_text", to, body: CITA_ASK_DEPARTAMENTO_BODY },
    ],
    outcome: "continue",
  };
}

function citaAwaitingUbigeoSelectHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  if (selection === undefined) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_INVALID_SELECTION_BODY }], outcome: "continue" };
  }
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaUbigeo: selection } },
    CITA_ESPECIALIDAD_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      { kind: "list_especialidades", ubigeo: selection, token: citaBearerOf(session) },
    ],
    outcome: "continue",
  };
}

function citaEspecialidadPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "list_especialidades_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  if (result.status === "especialidades_found") {
    const advanced = withState(session, CITA_AWAITING_ESPECIALIDAD_SELECT_STATE);
    return {
      session: advanced,
      effects: [
        buildListEffect(
          to,
          "Selecciona una especialidad:",
          "Ver opciones",
          result.options.map((o) => ({
            id: o.codigoEspecialidad,
            title: o.nombreEspecialidad,
            description: `${o.nombreEspecialidad} — ${o.cantidadCupos} cupo(s)`,
          }))
        ),
      ],
      outcome: "continue",
    };
  }
  const closed = withState({ ...session, slots: clearCitaSlots(session.slots) }, CITA_BOOKING_REJECTED_STATE);
  return {
    session: closed,
    effects: [
      { kind: "send_text", to, body: CITA_ESPECIALIDADES_EMPTY_BODY },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

function citaAwaitingEspecialidadSelectHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  if (selection === undefined) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_INVALID_SELECTION_BODY }], outcome: "continue" };
  }
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaEspecialidadId: selection } },
    CITA_ESTABLECIMIENTO_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      {
        kind: "list_establecimientos",
        ubigeo: stringSlot(session, "citaUbigeo"),
        especialidadId: selection,
        token: citaBearerOf(session),
      },
    ],
    outcome: "continue",
  };
}

function citaEstablecimientoPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "list_establecimientos_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  if (result.status === "establecimientos_found") {
    const advanced = withState(session, CITA_AWAITING_ESTABLECIMIENTO_SELECT_STATE);
    return {
      session: advanced,
      effects: [
        buildListEffect(
          to,
          "Selecciona un establecimiento:",
          "Ver opciones",
          result.options.map((o) => ({
            id: o.renipressCode,
            title: o.establishmentName,
            description: `${o.establishmentName} · ${o.quotasOnline} cupo(s)`,
          }))
        ),
      ],
      outcome: "continue",
    };
  }
  const closed = withState({ ...session, slots: clearCitaSlots(session.slots) }, CITA_BOOKING_REJECTED_STATE);
  return {
    session: closed,
    effects: [
      { kind: "send_text", to, body: CITA_ESTABLECIMIENTOS_EMPTY_BODY },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

function citaAwaitingEstablecimientoSelectHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  if (selection === undefined) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_INVALID_SELECTION_BODY }], outcome: "continue" };
  }
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaCodEess: selection } },
    CITA_FECHA_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      {
        kind: "list_fechas",
        codEess: selection,
        especialidadId: stringSlot(session, "citaEspecialidadId"),
        token: citaBearerOf(session),
      },
    ],
    outcome: "continue",
  };
}

function citaFechaPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "list_fechas_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  if (result.status === "fechas_found") {
    const advanced = withState(session, CITA_AWAITING_FECHA_SELECT_STATE);
    return {
      session: advanced,
      effects: [
        buildListEffect(
          to,
          "Selecciona una fecha:",
          "Ver fechas",
          result.options.map((o) => ({
            id: o.fechaCupo,
            title: o.fechaCupo,
            description: `${o.cantidadCupos} cupo(s) disponible(s)`,
          }))
        ),
      ],
      outcome: "continue",
    };
  }
  const closed = withState({ ...session, slots: clearCitaSlots(session.slots) }, CITA_BOOKING_REJECTED_STATE);
  return {
    session: closed,
    effects: [
      { kind: "send_text", to, body: CITA_FECHAS_EMPTY_BODY },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

function citaAwaitingFechaSelectHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  if (selection === undefined) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_INVALID_SELECTION_BODY }], outcome: "continue" };
  }
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaFecha: selection } },
    CITA_HORA_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_SEARCHING_BODY },
      {
        kind: "list_horas",
        codEess: stringSlot(session, "citaCodEess"),
        especialidadId: stringSlot(session, "citaEspecialidadId"),
        fecha: selection,
        token: citaBearerOf(session),
      },
    ],
    outcome: "continue",
  };
}

function citaHoraPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "list_horas_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_SEARCHING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  if (result.status === "horas_found") {
    const advanced = withState(session, CITA_AWAITING_HORA_SELECT_STATE);
    return {
      session: advanced,
      effects: [
        buildListEffect(
          to,
          "Selecciona un horario:",
          "Ver horarios",
          result.options.map((o) => ({
            id: `${o.horaInicio}|${o.horaFin}`,
            title: `${o.horaInicio} - ${o.horaFin}`,
            description: `${o.cantidadCupos} cupo(s) disponible(s)`,
          }))
        ),
      ],
      outcome: "continue",
    };
  }
  const closed = withState({ ...session, slots: clearCitaSlots(session.slots) }, CITA_BOOKING_REJECTED_STATE);
  return {
    session: closed,
    effects: [
      { kind: "send_text", to, body: CITA_HORAS_EMPTY_BODY },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

function citaAwaitingHoraSelectHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const selection = isInboundEvent(event) ? (event.interactiveReplyId ?? event.text) : undefined;
  if (selection === undefined) {
    return { session, effects: [{ kind: "send_text", to, body: CITA_INVALID_SELECTION_BODY }], outcome: "continue" };
  }
  const horaInicio = selection.split("|")[0] ?? selection;
  const advanced = withState(
    { ...session, slots: { ...session.slots, citaHoraInicio: horaInicio } },
    CITA_BOOKING_PENDING_STATE
  );
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: CITA_BOOKING_BODY },
      {
        kind: "book_appointment",
        codigoRenipress: stringSlot(session, "citaCodEess"),
        codigoUps: stringSlot(session, "citaEspecialidadId"),
        fechaCita: stringSlot(session, "citaFecha"),
        horaCita: horaInicio,
        numeroDocumentoPaciente: citaDniOf(session),
        token: citaBearerOf(session),
      },
    ],
    outcome: "continue",
  };
}

function citaBookingPendingHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  if (isInboundEvent(event) || event.kind !== "book_appointment_result") {
    return { session, effects: [{ kind: "send_text", to, body: CITA_BOOKING_BODY }], outcome: "continue" };
  }
  const result = event.result;
  const cleared = { ...session, slots: clearCitaSlots(session.slots) };

  if (result.status !== "booked" && result.status !== "duplicate" && result.status !== "booking_rejected") {
    // Defensive: unreachable given BookAppointmentResult's exhaustive status
    // union, but a foreign/malformed result must never crash the worker.
    return { session, effects: [{ kind: "send_text", to, body: CITA_BOOKING_BODY }], outcome: "continue" };
  }

  if (result.status === "booked") {
    const advanced = withState(cleared, CITA_BOOKED_STATE);
    return {
      session: advanced,
      effects: [
        {
          kind: "send_text",
          to,
          body: `Tu cita fue agendada correctamente. ${result.mensajeApi}\n${result.url}`.trim(),
        },
        { kind: "end_session", to },
      ],
      outcome: "rejected",
    };
  }
  if (result.status === "duplicate") {
    const advanced = withState(cleared, CITA_BOOKING_DUPLICATE_STATE);
    return {
      session: advanced,
      effects: [
        { kind: "send_text", to, body: CITA_BOOKING_DUPLICATE_BODY },
        { kind: "end_session", to },
      ],
      outcome: "rejected",
    };
  }
  const advanced = withState(cleared, CITA_BOOKING_REJECTED_STATE);
  return {
    session: advanced,
    effects: [
      { kind: "send_text", to, body: `No pudimos agendar tu cita: ${result.motivo}` },
      { kind: "end_session", to },
    ],
    outcome: "rejected",
  };
}

// Design's FSM states table: every terminal Reclamo state
// (`reclamo_confirmed`, `reclamo_rejected`, `reclamo_failed`) shares one
// handler — "any inbound -> main_menu": a fresh start with the main menu
// list. Slots are already cleared at the terminal TRANSITION itself
// (D22/DNI-3), so this handler does no clearing of its own. PR6: also shared
// by `cita_registration_rejected` (design's FSM states table, closing row).
// PR7: also shared by `cita_otp_locked`.
function closedFlowHandler(session: ConversationSession, event: FsmEvent): FsmResult {
  const to = event.from ?? "";
  const reset = withState(session, MAIN_MENU_STATE);
  return { session: reset, effects: [mainMenuListEffect(to)], outcome: "continue" };
}

export const STATE_HANDLERS: Record<ConversationStateName, StateHandler> = {
  [MAIN_MENU_STATE]: mainMenuHandler,
  [AWAITING_FLOW_START_STATE]: awaitingFlowStartHandler,
  [RECLAMO_IDENTITY_CHOICE_STATE]: reclamoIdentityChoiceHandler,
  [RECLAMO_AWAITING_DNI_STATE]: reclamoAwaitingDniHandler,
  [RECLAMO_AWAITING_NOMBRE_STATE]: reclamoAwaitingNombreHandler,
  [RECLAMO_RENIEC_PENDING_STATE]: reclamoReniecPendingHandler,
  [RECLAMO_AWAITING_DESCRIPCION_STATE]: reclamoAwaitingDescripcionHandler,
  [RECLAMO_AWAITING_FOTO_STATE]: reclamoAwaitingFotoHandler,
  [RECLAMO_SUBMIT_PENDING_STATE]: reclamoSubmitPendingHandler,
  [RECLAMO_REJECTED_STATE]: closedFlowHandler,
  [RECLAMO_CONFIRMED_STATE]: closedFlowHandler,
  [RECLAMO_FAILED_STATE]: closedFlowHandler,
  [CITA_AWAITING_DNI_STATE]: citaAwaitingDniHandler,
  [CITA_VALIDATE_PENDING_STATE]: citaValidatePendingHandler,
  [CITA_REGISTRATION_WAIT_STATE]: citaRegistrationWaitHandler,
  [CITA_REGISTRATION_REJECTED_STATE]: closedFlowHandler,
  [CITA_AWAITING_OTP_STATE]: citaAwaitingOtpHandler,
  [CITA_VERIFY_PENDING_STATE]: citaVerifyPendingHandler,
  [CITA_IDENTITY_CONFIRMED_STATE]: citaIdentityConfirmedHandler,
  [CITA_OTP_LOCKED_STATE]: closedFlowHandler,
  // Cita catalog/booking MVP (no-SDD fast path):
  [CITA_AWAITING_DEPARTAMENTO_STATE]: citaAwaitingDepartamentoHandler,
  [CITA_AWAITING_PROVINCIA_STATE]: citaAwaitingProvinciaHandler,
  [CITA_AWAITING_DISTRITO_STATE]: citaAwaitingDistritoHandler,
  [CITA_UBIGEO_AI_PENDING_STATE]: citaUbigeoAiPendingHandler,
  [CITA_UBIGEO_PENDING_STATE]: citaUbigeoPendingHandler,
  [CITA_AWAITING_UBIGEO_SELECT_STATE]: citaAwaitingUbigeoSelectHandler,
  [CITA_ESPECIALIDAD_PENDING_STATE]: citaEspecialidadPendingHandler,
  [CITA_AWAITING_ESPECIALIDAD_SELECT_STATE]: citaAwaitingEspecialidadSelectHandler,
  [CITA_ESTABLECIMIENTO_PENDING_STATE]: citaEstablecimientoPendingHandler,
  [CITA_AWAITING_ESTABLECIMIENTO_SELECT_STATE]: citaAwaitingEstablecimientoSelectHandler,
  [CITA_FECHA_PENDING_STATE]: citaFechaPendingHandler,
  [CITA_AWAITING_FECHA_SELECT_STATE]: citaAwaitingFechaSelectHandler,
  [CITA_HORA_PENDING_STATE]: citaHoraPendingHandler,
  [CITA_AWAITING_HORA_SELECT_STATE]: citaAwaitingHoraSelectHandler,
  [CITA_BOOKING_PENDING_STATE]: citaBookingPendingHandler,
  [CITA_BOOKED_STATE]: closedFlowHandler,
  [CITA_BOOKING_DUPLICATE_STATE]: closedFlowHandler,
  [CITA_BOOKING_REJECTED_STATE]: closedFlowHandler,
};

// D13: looks up the current state's handler; falls back to main_menu for an
// unknown/unregistered state so a stale or corrupted session never crashes
// the worker — it safely resets the citizen into the menu instead.
export function handle(session: ConversationSession, event: FsmEvent): FsmResult {
  const stateHandler = STATE_HANDLERS[session.state] ?? STATE_HANDLERS[MAIN_MENU_STATE];
  return stateHandler(session, event);
}
