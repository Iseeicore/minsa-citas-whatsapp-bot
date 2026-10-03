import { buildResult, sendText, TERMINAL_STATES, withNote } from "@/lib/fsm/core/handlers-shared";
import { isEmergency, isEmergencyInFlow, OOS_MESSAGES } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import type { HandlerResult } from "@/lib/fsm/core/types";

export const EMERGENCY_CLOSED_STATE = "emergency_closed";

export function emergencyCut(fromState: string): HandlerResult {
  return withNote(
    buildResult({ state: EMERGENCY_CLOSED_STATE, slots: {}, counters: {} }, [sendText(OOS_MESSAGES[OosCategory.OOS_01])]),
    { kind: "out_of_scope", level: "warn", detail: { category: OosCategory.OOS_01, state: fromState, closed: true } },
  );
}

export function isEmergencyTurn(state: string, text: string): boolean {
  const atMenu = state === "main_menu" || TERMINAL_STATES.has(state);
  return atMenu ? isEmergency(text) : isEmergencyInFlow(text);
}
