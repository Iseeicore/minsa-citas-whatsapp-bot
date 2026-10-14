import {
  buildResult,
  omitSlot,
  query,
  readReply,
  sendText,
  withNote,
} from "@/lib/fsm/core/handlers-shared";
import {
  detectCitaRequest,
  isContinueReply,
  isGreeting,
  isIncidenciaKeyword,
} from "@/lib/fsm/routing/menu-shortcuts";
import { beginCita, buildMenuEffect, disabledServiceReply } from "@/lib/fsm/routing/flow-entry";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { beginConsulta } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { extractCodigoIncidencia, isConsultaKeyword } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/ubicacion";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import {
  detectOutOfScope,
  isCitaKeyword,
  isContinueKeyword,
  oosMessage,
  type OosCategory,
} from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { looksLikeNoise } from "@/lib/security/text-noise";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const CONTINUE_BUTTON_ID = "continuar_menu";

const incidenciaService = serviceCatalog.byId(MenuChoice.REGISTRAR_INCIDENCIA);
const consultaService = serviceCatalog.byId(MenuChoice.CONSULTAR_INCIDENCIA);

export function enterMainMenu(preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: SessionState.MAIN_MENU, slots: preservedSlots, counters: {} }, [buildMenuEffect()]);
}

export function handleAwaitingFlowStart(session: Session): HandlerResult {
  const next: Session = {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
  };

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.REGISTRAR_INCIDENCIA) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, omitSlot(next.slots, SlotKey.MENU_CHOICE));
    return beginIncidencia(next.slots, "");
  }

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.AGENDAR_CITA) {
    next.state = SessionState.CITA_AWAITING_DNI;
    return buildResult(next, [sendText("Ingresa tu número de documento.")]);
  }

  return enterMainMenu();
}

export function handleMainMenu(pending: Session, event: InboundEvent): HandlerResult {
  const awaitingContinue = pending.slots[SlotKey.AWAITING_CONTINUE] === true;
  const session: Session = { ...pending, slots: omitSlot(pending.slots, SlotKey.AWAITING_CONTINUE) };

  if (awaitingContinue && event.text && isContinueReply(event.text)) {
    return withNote(enterMainMenu(session.slots), { kind: "shortcut", detail: { name: "continue_after_warning" } });
  }

  const codigo = event.text ? extractCodigoIncidencia(event.text) : null;
  if (codigo) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, session.slots);
    return withNote(beginConsulta(event.channel, codigo), { kind: "shortcut", detail: { name: "consulta_codigo" } });
  }
  if (event.text && isConsultaKeyword(event.text)) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, session.slots);
    return withNote(beginConsulta(event.channel), { kind: "shortcut", detail: { name: "consulta_keyword" } });
  }

  const inicio = event.text ? parseInicioIncidencia(event.text) : null;
  if (inicio) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, session.slots);
    return withNote(beginIncidencia(session.slots, "", inicio), {
      kind: "shortcut",
      detail: { name: inicio.origen === "qr" ? "incidencia_qr" : "incidencia_start" },
    });
  }

  const numericChoice = event.text ? serviceCatalog.byMenuNumber(event.text)?.id : undefined;
  const replyId = numericChoice ?? readReply(event);

  if (replyId === CONTINUE_BUTTON_ID) {
    return enterMainMenu(session.slots);
  }

  if (replyId === MenuChoice.CONSULTAR_INCIDENCIA) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, session.slots);
    return beginConsulta(event.channel);
  }

  if (replyId !== MenuChoice.AGENDAR_CITA && replyId !== MenuChoice.REGISTRAR_INCIDENCIA) {
    if (event.text && isIncidenciaKeyword(event.text)) {
      return withNote(
        handleAwaitingFlowStart({
          state: SessionState.AWAITING_FLOW_START,
          slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.REGISTRAR_INCIDENCIA },
          counters: {},
        }),
        { kind: "shortcut", detail: { name: "incidencia_keyword" } },
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
          state: SessionState.AWAITING_FLOW_START,
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
      return withNote(buildResult({ state: SessionState.MAIN_MENU, slots: preservedSlots, counters: {} }, []), {
        kind: "menu_fallback",
        level: "warn",
        detail: { reason: "noise_silenced_before_ai" },
      });
    }

    if (event.text) {
      const next: Session = {
        state: SessionState.MAIN_MENU_INTENT_PENDING,
        slots: { ...preservedSlots, [SlotKey.INCIDENCIA_BORRADOR]: event.text },
        counters: {},
      };
      return buildResult(next, [
        sendText("Un momento, estamos revisando tu mensaje…"),
        query(QueryKind.ANALYZE_MAIN_MENU_INTENT, { text: event.text }),
      ]);
    }

    return enterMainMenu(preservedSlots);
  }

  const next: Session = {
    state: SessionState.AWAITING_FLOW_START,
    slots: { ...session.slots, [SlotKey.MENU_CHOICE]: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next);
}

export const OUT_OF_SCOPE_REQUEST_TEXT =
  "Solo puedo ayudarte a agendar una cita médica o a registrar una incidencia. Elige una opción:";

const OUT_OF_SCOPE_REQUEST_TEXT_SOLO_CITAS = "Solo puedo ayudarte a agendar una cita médica. Elige una opción:";

function outOfScopeRequestText(): string {
  return incidenciaService.isEnabled() ? OUT_OF_SCOPE_REQUEST_TEXT : OUT_OF_SCOPE_REQUEST_TEXT_SOLO_CITAS;
}

export function handleMainMenuIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { intent?: string; especialidad?: string; distrito?: string };
  const slots = omitSlot(session.slots, SlotKey.INCIDENCIA_BORRADOR);

  if (result.intent === MainMenuIntent.INCIDENCIA) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, slots);
    return withNote(beginIncidencia(slots, "", { origen: "ia", resto: session.slots[SlotKey.INCIDENCIA_BORRADOR] }), {
      kind: "shortcut",
      detail: { name: "incidencia_ai" },
    });
  }

  if (result.intent === MainMenuIntent.CITA) return beginCitaFromIntent(slots, result);

  if (result.intent === MainMenuIntent.FUERA_DE_ALCANCE) {
    return withNote(
      buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [
        sendText(outOfScopeRequestText()),
        buildMenuEffect(),
      ]),
      { kind: "out_of_scope", detail: { reason: "ai_request" } },
    );
  }

  return withNote(enterMainMenu(slots), {
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
    "¡Entendido! Quieres agendar una cita médica. Antes de continuar necesito verificar tu identidad — ingresa tu número de documento.",
  );
}

function outOfScopeReply(category: OosCategory, slots: Session["slots"] = {}): HandlerResult {
  return withNote(buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [sendText(oosMessage(category))]), {
    kind: "out_of_scope",
    detail: { category },
  });
}
