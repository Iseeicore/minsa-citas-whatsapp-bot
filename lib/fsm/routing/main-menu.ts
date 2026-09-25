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

export const AWAITING_CONTINUE_SLOT = "awaitingContinue";

const NUMERIC_MENU_CHOICES: Record<string, string> = {
  "1": "agendar_cita",
  "2": "registrar_reclamo",
};

export function enterMainMenu(preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: "main_menu", slots: preservedSlots, counters: {} }, [buildMenuEffect()]);
}

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

    const preservedSlots =
      !session.slots.initialMessageText && event.text
        ? { initialMessageText: event.text }
        : session.slots;

    const cita = event.text ? detectCitaRequest(event.text) : undefined;
    if (cita) return withNote(beginCitaFromIntent(preservedSlots, cita), { kind: "shortcut", detail: { name: "cita_request" } });

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

  return withNote(enterMainMenu(session.slots), {
    kind: "menu_fallback",
    level: "warn",
    detail: { reason: "intent_unclear" },
  });
}

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

function outOfScopeReply(category: OosCategory, slots: Session["slots"] = {}): HandlerResult {
  return withNote(buildResult({ state: "main_menu", slots, counters: {} }, [sendText(OOS_MESSAGES[category])]), {
    kind: "out_of_scope",
    detail: { category },
  });
}
