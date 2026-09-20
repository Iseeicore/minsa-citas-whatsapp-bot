import { buildResult, sendText, TERMINAL_STATES, withNote } from "./handlers-shared";
import { isEmergency, isEmergencyInFlow, OOS_MESSAGES } from "./out-of-scope";
import type { HandlerResult } from "./types";

// A medical emergency ends the conversation, wherever it is typed. The citizen
// gets ONE message with the official numbers and the advice to go to the nearest
// health facility, and nothing else: the bot does not assist, diagnose or keep a
// flow open. The session is closed (a terminal state with no slots), so no step is
// left pending and no verification is kept; whatever the citizen writes next starts
// a new conversation, exactly as after any finished flow.
//
// It is read before everything else in the turn: before an expired session or the
// re-verification question, before the lexical guard and before any intention to
// book or to complain.

export const EMERGENCY_CLOSED_STATE = "emergency_closed";

export function emergencyCut(fromState: string): HandlerResult {
  return withNote(
    buildResult({ state: EMERGENCY_CLOSED_STATE, slots: {}, counters: {} }, [sendText(OOS_MESSAGES["OOS-01"])]),
    // An emergency is the one category that must stand out in the logs.
    { kind: "out_of_scope", level: "warn", detail: { category: "OOS-01", state: fromState, closed: true } },
  );
}

// At the menu and after a finished flow the whole text is read. Inside a flow only
// a short one is: a long complaint that mentions an ambulance is evidence for that
// step, not an alarm (see IN_FLOW_MAX_CHARS).
export function isEmergencyTurn(state: string, text: string): boolean {
  const atMenu = state === "main_menu" || TERMINAL_STATES.has(state);
  return atMenu ? isEmergency(text) : isEmergencyInFlow(text);
}
