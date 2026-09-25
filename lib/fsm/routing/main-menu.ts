import {
  buildResult,
  omitSlot,
  query,
  readReply,
  sendButtons,
  sendText,
  withNote,
} from "@/lib/fsm/core/handlers-shared";
import {
  detectCitaRequest,
  isContinueReply,
  isGreeting,
  isReclamoKeyword,
} from "@/lib/fsm/routing/menu-shortcuts";
import { beginCita, buildMenuEffect, RECLAMO_IDENTITY_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import {
  detectOutOfScope,
  isCitaKeyword,
  isContinueKeyword,
  OOS_MESSAGES,
  type OosCategory,
} from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";

export const CONTINUE_BUTTON_ID = "continuar_menu";

// Set while the institutional warning's "Continuar" button is the pending
// question, so a typed "ya dale" can answer it. The next message consumes it.
export const AWAITING_CONTINUE_SLOT = "awaitingContinue";

// Typing the row's number is the same as tapping the row: no static menu is
// printed again when the intent is that explicit.
const NUMERIC_MENU_CHOICES: Record<string, string> = {
  "1": "agendar_cita",
  "2": "registrar_reclamo",
};

export function enterMainMenu(preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: "main_menu", slots: preservedSlots, counters: {} }, [buildMenuEffect()]);
}

// Resolves awaiting_flow_start's branch directly into its target state's
// entry prompt, in the same turn as the main_menu selection that produced it.
export function handleAwaitingFlowStart(session: Session): HandlerResult {
  const next: Session = {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };

  if (next.slots.menuChoice === "registrar_reclamo") {
    next.state = "reclamo_identity_choice";
    return buildResult(next, [sendButtons("¿Tienes tu documento de identidad a la mano?", RECLAMO_IDENTITY_BUTTONS)]);
  }

  if (next.slots.menuChoice === "agendar_cita") {
    next.state = "cita_awaiting_dni";
    return buildResult(next, [sendText("Ingresa tu número de documento (8 dígitos).")]);
  }

  // Defensive fallback — should be unreachable since main_menu only accepts
  // the two known row ids before transitioning here.
  return enterMainMenu();
}

export function handleMainMenu(pending: Session, event: InboundEvent): HandlerResult {
  const awaitingContinue = pending.slots[AWAITING_CONTINUE_SLOT] === true;
  const session: Session = { ...pending, slots: omitSlot(pending.slots, AWAITING_CONTINUE_SLOT) };

  if (awaitingContinue && event.text && isContinueReply(event.text)) {
    return withNote(enterMainMenu(session.slots), { kind: "shortcut", detail: { name: "continue_after_warning" } });
  }

  const numericChoice = event.text ? NUMERIC_MENU_CHOICES[event.text.trim()] : undefined;
  const replyId = numericChoice ?? readReply(event);

  if (replyId === CONTINUE_BUTTON_ID) {
    return enterMainMenu(session.slots);
  }

  if (replyId !== "agendar_cita" && replyId !== "registrar_reclamo") {
    // Deterministic shortcuts first: they cost no AI call, and a bare
    // greeting must not become the "opening message" later used as context.
    if (event.text && isReclamoKeyword(event.text)) {
      return withNote(
        handleAwaitingFlowStart({
          state: "awaiting_flow_start",
          slots: { ...session.slots, menuChoice: "registrar_reclamo" },
          counters: {},
        }),
        { kind: "shortcut", detail: { name: "reclamo_keyword" } },
      );
    }

    if (event.text && isGreeting(event.text)) {
      return withNote(enterMainMenu(session.slots), { kind: "shortcut", detail: { name: "greeting" } });
    }

    // The words the out-of-scope messages ask the citizen to type.
    if (event.text && isContinueKeyword(event.text)) {
      return withNote(enterMainMenu(session.slots), { kind: "shortcut", detail: { name: "continue_keyword" } });
    }

    if (event.text && isCitaKeyword(event.text)) {
      return withNote(
        handleAwaitingFlowStart({
          state: "awaiting_flow_start",
          slots: { ...session.slots, menuChoice: "agendar_cita" },
          counters: {},
        }),
        { kind: "shortcut", detail: { name: "cita_keyword" } },
      );
    }

    const outOfScope = event.text ? detectOutOfScope(event.text) : undefined;
    if (outOfScope) return outOfScopeReply(outOfScope, session.slots);

    // Capture the citizen's very first free-text message (only once — not on
    // every subsequent invalid menu tap) so later steps like the Cita
    // district question can use it as context. A message like "quiero una
    // cita en Miraflores" sent before ever touching the menu would otherwise
    // be discarded here with no trace.
    const preservedSlots =
      !session.slots.initialMessageText && event.text
        ? { initialMessageText: event.text }
        : session.slots;

    // A message that already names the cita and what the flow asks for
    // ("quiero una cita en San Borja de odontología") goes straight to the
    // Cita flow: no AI call, so nothing that can fail and bounce them back.
    const cita = event.text ? detectCitaRequest(event.text) : undefined;
    if (cita) return withNote(beginCitaFromIntent(preservedSlots, cita), { kind: "shortcut", detail: { name: "cita_request" } });

    // Before just re-showing the menu, see if this free text already
    // expresses a clear intent to book an appointment (e.g. "quiero una
    // cita de odontología") — if so, skip the menu entirely instead of
    // making them tap something they already told us in words.
    if (event.text) {
      const next: Session = { state: "main_menu_intent_pending", slots: preservedSlots, counters: {} };
      return buildResult(next, [
        sendText("Un momento, estamos revisando tu mensaje…"),
        query("analyze_main_menu_intent", { text: event.text }),
      ]);
    }

    return enterMainMenu(preservedSlots);
  }

  const next: Session = {
    state: "awaiting_flow_start",
    slots: { ...session.slots, menuChoice: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next);
}

export function handleMainMenuIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { intent?: string; especialidad?: string; distrito?: string };

  if (result.intent === "cita") return beginCitaFromIntent(session.slots, result);

  // The AI found no intent (or failed, see the ai.fallback log): back to the menu.
  return withNote(enterMainMenu(session.slots), {
    kind: "menu_fallback",
    level: "warn",
    detail: { reason: "intent_unclear" },
  });
}

// Shared by the deterministic reading and the AI's: the specialty and district
// the citizen already named seed the hints the Cita flow applies on its own.
function beginCitaFromIntent(
  slots: Session["slots"],
  hints: { especialidad?: string; distrito?: string },
): HandlerResult {
  return beginCita(
    slots,
    hints,
    "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento (8 dígitos).",
  );
}

// ---- Consultations the channel does not attend ------------------------------
// A fixed message that points to the official channel (see out-of-scope.ts). The
// citizen stays at the menu, where the words the message asks for (CITAS,
// RECLAMO, CONTINUAR) are understood without any AI call.
function outOfScopeReply(category: OosCategory, slots: Session["slots"] = {}): HandlerResult {
  return withNote(buildResult({ state: "main_menu", slots, counters: {} }, [sendText(OOS_MESSAGES[category])]), {
    kind: "out_of_scope",
    detail: { category },
  });
}
