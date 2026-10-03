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
import { beginCita, buildMenuEffect, RECLAMO_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import {
  detectOutOfScope,
  isCitaKeyword,
  isContinueKeyword,
  OOS_MESSAGES,
  type OosCategory,
} from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { looksLikeNoise } from "@/lib/security/text-noise";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";

export const CONTINUE_BUTTON_ID = "continuar_menu";


const NUMERIC_MENU_CHOICES: Record<string, MenuChoice> = {
  "1": MenuChoice.AGENDAR_CITA,
  "2": MenuChoice.REGISTRAR_RECLAMO,
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

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.REGISTRAR_RECLAMO) {
    next.state = "reclamo_identity_choice";
    return buildResult(next, [
      sendButtons("¿Deseas registrar tu nombre, o prefieres que sea anónimo?", RECLAMO_NOMBRE_BUTTONS),
    ]);
  }

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.AGENDAR_CITA) {
    next.state = "cita_awaiting_dni";
    return buildResult(next, [sendText("Ingresa tu número de documento (8 dígitos).")]);
  }

  return enterMainMenu();
}

export function handleMainMenu(pending: Session, event: InboundEvent): HandlerResult {
  const awaitingContinue = pending.slots[SlotKey.AWAITING_CONTINUE] === true;
  const session: Session = { ...pending, slots: omitSlot(pending.slots, SlotKey.AWAITING_CONTINUE) };

  if (awaitingContinue && event.text && isContinueReply(event.text)) {
    return withNote(enterMainMenu(session.slots), { kind: "shortcut", detail: { name: "continue_after_warning" } });
  }

  const numericChoice = event.text ? NUMERIC_MENU_CHOICES[event.text.trim()] : undefined;
  const replyId = numericChoice ?? readReply(event);

  if (replyId === CONTINUE_BUTTON_ID) {
    return enterMainMenu(session.slots);
  }

  if (replyId !== MenuChoice.AGENDAR_CITA && replyId !== MenuChoice.REGISTRAR_RECLAMO) {
    if (event.text && isReclamoKeyword(event.text)) {
      return withNote(
        handleAwaitingFlowStart({
          state: "awaiting_flow_start",
          slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.REGISTRAR_RECLAMO },
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
          slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA },
          counters: {},
        }),
        { kind: "shortcut", detail: { name: "cita_keyword" } },
      );
    }

    const outOfScope = event.text ? detectOutOfScope(event.text) : undefined;
    if (outOfScope) return outOfScopeReply(outOfScope, session.slots);

    const preservedSlots =
      !session.slots[SlotKey.INITIAL_MESSAGE_TEXT] && event.text
        ? { [SlotKey.INITIAL_MESSAGE_TEXT]: event.text }
        : session.slots;

    const cita = event.text ? detectCitaRequest(event.text) : undefined;
    if (cita) return withNote(beginCitaFromIntent(preservedSlots, cita), { kind: "shortcut", detail: { name: "cita_request" } });

    if (event.text && looksLikeNoise(event.text)) {
      return withNote(buildResult({ state: "main_menu", slots: preservedSlots, counters: {} }, []), {
        kind: "menu_fallback",
        level: "warn",
        detail: { reason: "noise_silenced_before_ai" },
      });
    }

    if (event.text) {
      const next: Session = { state: "main_menu_intent_pending", slots: preservedSlots, counters: {} };
      return buildResult(next, [
        sendText("Un momento, estamos revisando tu mensaje…"),
        query(QueryKind.ANALYZE_MAIN_MENU_INTENT, { text: event.text }),
      ]);
    }

    return enterMainMenu(preservedSlots);
  }

  const next: Session = {
    state: "awaiting_flow_start",
    slots: { ...session.slots, [SlotKey.MENU_CHOICE]: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next);
}

export const OUT_OF_SCOPE_REQUEST_TEXT =
  "Solo puedo ayudarte a agendar una cita médica o a registrar un reclamo en el Libro de Reclamaciones. Elige una opción:";

export function handleMainMenuIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { intent?: string; especialidad?: string; distrito?: string };

  if (result.intent === MainMenuIntent.CITA) return beginCitaFromIntent(session.slots, result);

  if (result.intent === MainMenuIntent.FUERA_DE_ALCANCE) {
    return withNote(
      buildResult({ state: "main_menu", slots: session.slots, counters: {} }, [
        sendText(OUT_OF_SCOPE_REQUEST_TEXT),
        buildMenuEffect(),
      ]),
      { kind: "out_of_scope", detail: { reason: "ai_request" } },
    );
  }

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
