import { buildResult, sendText, TERMINAL_STATES, withNote } from "@/lib/fsm/core/handlers-shared";
import { isEmergency, isEmergencyInFlow } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import type { HandlerResult } from "@/lib/fsm/core/types";
import { SessionState } from "@/lib/enums/session-state";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";

export function emergencyCut(fromState: string): HandlerResult {
  return withNote(
    buildResult({ state: SessionState.EMERGENCY_CLOSED, slots: {}, counters: {} }, [sendText(OOS_MESSAGES[OosCategory.OOS_01])]),
    { kind: "out_of_scope", level: "warn", detail: { category: OosCategory.OOS_01, state: fromState, closed: true } },
  );
}

export function isEmergencyTurn(state: string, text: string): boolean {
  const atMenu = state === SessionState.MAIN_MENU || TERMINAL_STATES.has(state);
  return atMenu ? isEmergency(text) : isEmergencyInFlow(text);
}
