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
import type { ListRow, ListSection, ReplyButton } from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupResult } from "../ports/reniec-lookup-client.js";
import type { QuejaSubmissionResult } from "../ports/quejas-submission-client.js";
import type { ConversationSession, ConversationStateName, SlotValue } from "./conversation-session.js";
import { withState } from "./conversation-session.js";
import { isValidDniFormat } from "./dni.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";
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

export type FsmQueryEffect =
  | { kind: "reniec_lookup"; dni: string }
  | { kind: "quejas_submit"; submission: QuejaSubmission };

// Same exported name as Stage A, now a union of the two effect families.
export type FsmEffect = FsmSendEffect | FsmQueryEffect;

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
  readonly kind: "reniec_lookup_result" | "quejas_submit_result";
  readonly result: ReniecLookupResult | QuejaSubmissionResult;
}

// D20: additive widening. Every existing `InboundConversationEvent` call
// site remains assignable to `FsmEvent` — no Stage A test changes from this
// widening alone (see conversation-fsm.test.ts, unchanged assertions).
export type FsmEvent = InboundConversationEvent | FsmSystemEvent;

/** True for a real Meta-originated event; false for a synthesized system-result event (D20). */
export function isInboundEvent(event: FsmEvent): event is InboundConversationEvent {
  return event.source === "whatsapp";
}

type StateHandler = (session: ConversationSession, event: FsmEvent) => FsmResult;

const MAIN_MENU_STATE: ConversationStateName = "main_menu";
const AWAITING_FLOW_START_STATE: ConversationStateName = "awaiting_flow_start";
const RECLAMO_IDENTITY_CHOICE_STATE: ConversationStateName = "reclamo_identity_choice";

const MAIN_MENU_BODY = "¿En qué podemos ayudarte hoy?";
const MAIN_MENU_BUTTON_LABEL = "Ver opciones";

// Stage C stub, unchanged from PR1: the real Cita branch is out of scope for
// Stage B — see design's FSM states table, `agendar_cita` row, "explicit
// Stage C stub".
const CITA_PLACEHOLDER_BODY = "Estamos preparando la reserva de tu cita. En un momento continuamos.";

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
const RECLAMO_ASK_NOMBRE_BODY = "Ingresa tus nombres y apellidos, tal como figuran en tu DNI.";
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
const RECLAMO_CONFIRMED_BODY = "Tu reclamo fue registrado correctamente. Gracias por tu reporte.";
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
    // Stage C stub, unchanged from PR1 — out of scope for Stage B.
    return {
      session,
      effects: [{ kind: "send_text", to, body: CITA_PLACEHOLDER_BODY }],
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
    const body =
      result.reference !== undefined
        ? `${RECLAMO_CONFIRMED_BODY} N° de referencia: ${result.reference}.`
        : RECLAMO_CONFIRMED_BODY;
    return {
      session: confirmed,
      effects: [
        { kind: "send_text", to, body },
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

// Design's FSM states table: every terminal Reclamo state
// (`reclamo_confirmed`, `reclamo_rejected`, `reclamo_failed`) shares one
// handler — "any inbound -> main_menu": a fresh start with the main menu
// list. Slots are already cleared at the terminal TRANSITION itself
// (D22/DNI-3), so this handler does no clearing of its own.
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
};

// D13: looks up the current state's handler; falls back to main_menu for an
// unknown/unregistered state so a stale or corrupted session never crashes
// the worker — it safely resets the citizen into the menu instead.
export function handle(session: ConversationSession, event: FsmEvent): FsmResult {
  const stateHandler = STATE_HANDLERS[session.state] ?? STATE_HANDLERS[MAIN_MENU_STATE];
  return stateHandler(session, event);
}
