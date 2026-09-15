// D13 (design revision 2): `handle()` is a pure, zero-I/O engine dispatching
// through a STATE_HANDLERS registry keyed by state name. Stage B/C add a
// registry entry without ever touching this file's own signature. Purity
// keeps Strict TDD triangulation mock-free — every test below is a plain
// function call, no doubles.
//
// D17: every outbound effect carries `to` explicitly, sourced from the
// in-flight InboundConversationEvent.from held in memory for this job. It is
// NEVER read back out of the persisted session, which does not contain it.
import type { ListRow, ListSection, ReplyButton } from "../ports/whatsapp-outbound-sender.js";
import type { ConversationSession, ConversationStateName } from "./conversation-session.js";
import { withState } from "./conversation-session.js";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";

export type FsmEffect =
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

export interface FsmResult {
  /** Next state, already advanced — the caller persists this via SessionStore. */
  readonly session: ConversationSession;
  readonly effects: readonly FsmEffect[];
  /** "rejected" is a terminal business stop; Stage A never produces it. */
  readonly outcome: "continue" | "rejected";
}

type StateHandler = (session: ConversationSession, event: InboundConversationEvent) => FsmResult;

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
// asked whether they want to identify with DNI. `reclamo_identity_choice`
// itself is not yet registered in STATE_HANDLERS (Phase 4/5 own that reply
// handling) — an inbound reply to it safely falls back to main_menu via
// D13's registry-fallback guard, never undefined behavior.
const RECLAMO_IDENTITY_CHOICE_BODY = "¿Deseas identificarte con tu DNI?";
const RECLAMO_IDENTITY_CHOICE_BUTTONS: readonly ReplyButton[] = [
  { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
  { id: "reclamo_sin_dni", title: "No tengo DNI" },
];

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
function awaitingFlowStartHandler(session: ConversationSession, event: InboundConversationEvent): FsmResult {
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

function mainMenuHandler(session: ConversationSession, event: InboundConversationEvent): FsmResult {
  const to = event.from ?? "";
  const selection = event.interactiveReplyId ?? event.text;
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

export const STATE_HANDLERS: Record<ConversationStateName, StateHandler> = {
  [MAIN_MENU_STATE]: mainMenuHandler,
  [AWAITING_FLOW_START_STATE]: awaitingFlowStartHandler,
};

// D13: looks up the current state's handler; falls back to main_menu for an
// unknown/unregistered state so a stale or corrupted session never crashes
// the worker — it safely resets the citizen into the menu instead.
export function handle(session: ConversationSession, event: InboundConversationEvent): FsmResult {
  const stateHandler = STATE_HANDLERS[session.state] ?? STATE_HANDLERS[MAIN_MENU_STATE];
  return stateHandler(session, event);
}
