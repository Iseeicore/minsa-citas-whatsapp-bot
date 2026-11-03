import {
  buildResult,
  omitSlot,
  query,
  readTappedId,
  readTypedText,
  sendText,
  withNote,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isContinueReply, isGreeting, isIncidenciaKeyword, isReferenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import {
  askReferenciaChoice,
  beginCita,
  buildMenuEffect,
  disabledServiceReply,
  enterReferencias,
  outOfScopeReply,
} from "@/lib/fsm/routing/flow-entry";
import { matchExactOption } from "@/lib/fsm/parsing/selection/selection-matchers";
import { consultaService, incidenciaService, serviceCatalog } from "@/lib/services/service-catalog";
import { beginConsulta } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { beginReferencias } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { startCitaIdentity } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import { channelOf } from "@/lib/fsm/core/channel";
import { extractCodigoIncidencia, isConsultaKeyword } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/inicio";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { detectOutOfScope, isCitaKeyword, isContinueKeyword } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { ReferenciaChoiceButtonId } from "@/lib/enums/botones/referencia-choice-button-id";
import { REFERENCIA_CHOICE_BUTTONS } from "@/lib/constants/textos/referencia";
import { looksLikeNoise } from "@/lib/security/text-noise";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { MainMenuIntent } from "@/lib/enums/main-menu-intent";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { OUT_OF_SCOPE_REQUEST_TEXTS, CITA_INTENT_DETECTED_TEXT, CONTINUE_BUTTON_ID } from "@/lib/constants/textos/menu";
import { currentServiceOffer } from "@/lib/services/service-offer";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";

export function enterMainMenu(channel: SessionChannel, preservedSlots: Session["slots"] = {}): HandlerResult {
  return buildResult({ state: SessionState.MAIN_MENU, slots: preservedSlots, counters: {} }, [buildMenuEffect(channel)]);
}

export function handleAwaitingFlowStart(session: Session, channel: SessionChannel): HandlerResult {
  const next: Session = {
    state: session.state,
    slots: { ...session.slots },
    counters: { ...session.counters },
    channel,
  };

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.REGISTRAR_INCIDENCIA) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, channel, omitSlot(next.slots, SlotKey.MENU_CHOICE));
    return beginIncidencia(next.slots, "");
  }

  if (next.slots[SlotKey.MENU_CHOICE] === MenuChoice.AGENDAR_CITA) return startCitaIdentity(next);

  return enterMainMenu(channel);
}

function referenciaChoiceOf(event: InboundEvent): string | undefined {
  const tapped = readTappedId(event);
  if (tapped) return tapped;
  const typed = readTypedText(event);
  if (isReferenciaKeyword(typed)) return ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA;
  if (isCitaKeyword(typed)) return ReferenciaChoiceButtonId.AGENDAR_CITA;
  return matchExactOption(typed, REFERENCIA_CHOICE_BUTTONS)?.id;
}

export function handleReferenciaChoice(session: Session, event: InboundEvent): HandlerResult {
  const choice = referenciaChoiceOf(event);

  if (choice === ReferenciaChoiceButtonId.CONSULTAR_REFERENCIA) return beginReferencias(session.slots);

  if (choice === ReferenciaChoiceButtonId.AGENDAR_CITA) {
    return handleAwaitingFlowStart(
      {
        state: SessionState.AWAITING_FLOW_START,
        slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA },
        counters: {},
      },
      channelOf(session, event),
    );
  }

  return withRejectionNotice(askReferenciaChoice(session));
}

export function handleMainMenu(pending: Session, event: InboundEvent): HandlerResult {
  const awaitingContinue = pending.slots[SlotKey.AWAITING_CONTINUE] === true;
  const session: Session = { ...pending, slots: omitSlot(pending.slots, SlotKey.AWAITING_CONTINUE) };
  const channel = channelOf(pending, event);

  if (awaitingContinue && event.text && isContinueReply(event.text)) {
    return withNote(enterMainMenu(channel, session.slots), { kind: "shortcut", detail: { name: "continue_after_warning" } });
  }

  const codigo = event.text ? extractCodigoIncidencia(event.text) : undefined;
  if (codigo) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, channel, session.slots);
    return withNote(beginConsulta(event.channel, codigo), { kind: "shortcut", detail: { name: "consulta_codigo" } });
  }
  if (event.text && isConsultaKeyword(event.text)) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, channel, session.slots);
    return withNote(beginConsulta(event.channel), { kind: "shortcut", detail: { name: "consulta_keyword" } });
  }

  const inicio = event.text ? parseInicioIncidencia(event.text) : undefined;
  if (inicio) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, channel, session.slots);
    return withNote(beginIncidencia(session.slots, "", inicio), {
      kind: "shortcut",
      detail: { name: inicio.origen === IncidenciaOrigen.QR ? "incidencia_qr" : "incidencia_start" },
    });
  }

  const disabledByNumber = event.text ? serviceCatalog.disabledByMenuNumber(event.text, channel) : undefined;
  if (disabledByNumber) return disabledServiceReply(disabledByNumber, channel, session.slots);

  const numericChoice = event.text ? serviceCatalog.byMenuNumber(event.text, channel)?.id : undefined;
  const replyId = numericChoice ?? readTappedId(event);

  if (replyId === CONTINUE_BUTTON_ID) {
    return enterMainMenu(channel, session.slots);
  }

  if (replyId === MenuChoice.CONSULTAR_INCIDENCIA) {
    if (!consultaService.isEnabled()) return disabledServiceReply(consultaService, channel, session.slots);
    return beginConsulta(event.channel);
  }

  if (replyId === MenuChoice.CONSULTAR_REFERENCIA) return enterReferencias(session.slots, channel, beginReferencias);

  if (replyId !== MenuChoice.AGENDAR_CITA && replyId !== MenuChoice.REGISTRAR_INCIDENCIA) {
    if (event.text && isIncidenciaKeyword(event.text)) {
      if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, channel, session.slots);
      return withNote(
        handleAwaitingFlowStart(
          {
            state: SessionState.AWAITING_FLOW_START,
            slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.REGISTRAR_INCIDENCIA },
            counters: {},
          },
          channel,
        ),
        { kind: "shortcut", detail: { name: "incidencia_keyword" } },
      );
    }

    if (event.text && isReferenciaKeyword(event.text)) {
      return withNote(enterReferencias(session.slots, channel, beginReferencias), {
        kind: "shortcut",
        detail: { name: "referencia_keyword" },
      });
    }

    if (event.text && isGreeting(event.text)) {
      return withNote(enterMainMenu(channel, session.slots), { kind: "shortcut", detail: { name: "greeting" } });
    }

    if (event.text && isContinueKeyword(event.text)) {
      return withNote(enterMainMenu(channel, session.slots), { kind: "shortcut", detail: { name: "continue_keyword" } });
    }

    if (event.text && isCitaKeyword(event.text)) {
      return withNote(
        handleAwaitingFlowStart(
          {
            state: SessionState.AWAITING_FLOW_START,
            slots: { ...session.slots, [SlotKey.MENU_CHOICE]: MenuChoice.AGENDAR_CITA },
            counters: {},
          },
          channel,
        ),
        { kind: "shortcut", detail: { name: "cita_keyword" } },
      );
    }

    const outOfScope = event.text ? detectOutOfScope(event.text) : undefined;
    if (outOfScope) {
      return withNote(outOfScopeReply(outOfScope, channel, session.slots), { kind: "out_of_scope", detail: { category: outOfScope } });
    }

    const preservedSlots =
      !session.slots[SlotKey.INITIAL_MESSAGE_TEXT] && event.text ? { [SlotKey.INITIAL_MESSAGE_TEXT]: event.text } : session.slots;

    const cita = event.text ? detectCitaRequest(event.text) : undefined;
    if (cita) return withNote(beginCitaFromIntent(preservedSlots, cita, channel), { kind: "shortcut", detail: { name: "cita_request" } });

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
      return buildResult(next, [query(QueryKind.ANALYZE_MAIN_MENU_INTENT, { text: event.text })]);
    }

    return enterMainMenu(channel, preservedSlots);
  }

  const next: Session = {
    state: SessionState.AWAITING_FLOW_START,
    slots: { ...session.slots, [SlotKey.MENU_CHOICE]: replyId },
    counters: {},
  };
  return handleAwaitingFlowStart(next, channel);
}

export function handleMainMenuIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const channel = channelOf(session, event);
  const result = event.result as { intent?: string; especialidad?: string; distrito?: string };
  const slots = omitSlot(session.slots, SlotKey.INCIDENCIA_BORRADOR);

  if (result.intent === MainMenuIntent.INCIDENCIA) {
    if (!incidenciaService.isEnabled()) return disabledServiceReply(incidenciaService, channel, slots);
    return withNote(beginIncidencia(slots, "", { origen: IncidenciaOrigen.IA, resto: session.slots[SlotKey.INCIDENCIA_BORRADOR] }), {
      kind: "shortcut",
      detail: { name: "incidencia_ai" },
    });
  }

  if (result.intent === MainMenuIntent.REFERENCIA) {
    return withNote(enterReferencias(slots, channel, beginReferencias), { kind: "shortcut", detail: { name: "referencia_ai" } });
  }

  if (result.intent === MainMenuIntent.CITA) return beginCitaFromIntent(slots, result, channel);

  if (result.intent === MainMenuIntent.FUERA_DE_ALCANCE) {
    return withNote(
      buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [
        sendText(OUT_OF_SCOPE_REQUEST_TEXTS[currentServiceOffer()]),
        buildMenuEffect(channel),
      ]),
      { kind: "out_of_scope", detail: { reason: "ai_request" } },
    );
  }

  return withNote(enterMainMenu(channel, slots), {
    kind: "menu_fallback",
    level: "warn",
    detail: { reason: "intent_unclear" },
  });
}

function beginCitaFromIntent(
  slots: Session["slots"],
  hints: { especialidad?: string; distrito?: string },
  channel: SessionChannel,
): HandlerResult {
  return beginCita(slots, hints, CITA_INTENT_DETECTED_TEXT, channel);
}
