import { buildResult, omitSlot, pageEffects, sendButtons, sendText, TERMINAL_STATES, withNote } from "@/lib/fsm/core/handlers-shared";
import { extractCitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/ubicacion";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { askReferenciaChoice, disabledServiceReply } from "@/lib/fsm/routing/flow-entry";
import { reshowReferenciaConfirmation } from "@/lib/fsm/flows/cita/steps/booking/references";
import { askCitaOffer } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { askReferenciaEleccion, askReferenciaSinCupos } from "@/lib/fsm/flows/referencia/cita-con-referencia";
import { channelOf } from "@/lib/fsm/core/channel";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { evaluateLexicalGuard, type LexicalAction } from "@/lib/security/lexical-guard";
import type { HandleEvent, HandlerResult, Session } from "@/lib/fsm/core/types";
import type { TurnNote } from "@/lib/observability/types";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  ASK_DISTRITO_TEXT,
  ASK_DEPARTAMENTO_TEXT,
  ASK_PROVINCIA_QUESTION_TEXT,
  ASK_DISTRITO_QUESTION_TEXT,
} from "@/lib/constants/textos/cita-ubicacion";
import {
  RESPECT_REMINDER_TEXT,
  INSTITUTIONAL_WARNING_TEXT,
  CITA_WITH_WARNING_TEXT,
  FORCED_INCIDENCIA_LEAD_TEXT,
  CONTINUE_BUTTONS,
} from "@/lib/constants/textos/seguridad";
import { InboundEventType } from "@/lib/enums/inbound-event-type";

const FREE_TEXT_STATE_PROMPTS: Record<string, string> = {
  [SessionState.CITA_AWAITING_DISTRITO_AI]: ASK_DISTRITO_TEXT,
  [SessionState.CITA_AWAITING_DEPARTAMENTO]: ASK_DEPARTAMENTO_TEXT,
  [SessionState.CITA_AWAITING_PROVINCIA]: ASK_PROVINCIA_QUESTION_TEXT,
  [SessionState.CITA_AWAITING_DISTRITO]: ASK_DISTRITO_QUESTION_TEXT,
};

const SELECTION_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION,
  SessionState.CITA_AWAITING_UBIGEO_SELECT,
  SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT,
  SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT,
  SessionState.CITA_AWAITING_FECHA_SELECT,
  SessionState.CITA_AWAITING_HORA_SELECT,
  SessionState.CITA_AWAITING_HORA_CHOICE,
  SessionState.CITA_AWAITING_REFERENCIA_SELECT,
]);

const BUTTON_STATE_REPROMPTS: Record<string, (session: Session) => HandlerResult> = {
  [SessionState.CITA_AWAITING_REFERENCIA_CONFIRM]: reshowReferenciaConfirmation,
  [SessionState.REFERENCIA_AWAITING_CITA_OFFER]: askCitaOffer,
  [SessionState.CITA_AWAITING_REFERENCIA_ELECCION]: askReferenciaEleccion,
  [SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS]: askReferenciaSinCupos,
  [SessionState.MAIN_MENU_REFERENCIA_CHOICE]: askReferenciaChoice,
};

function institutionalWarningText(): string {
  return serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA) ? INSTITUTIONAL_WARNING_TEXT : RESPECT_REMINDER_TEXT;
}

export function routeLexicalAction(session: Session, action: Exclude<LexicalAction, "ALLOW">, message?: string): HandlerResult {
  const slots = session.state === SessionState.MAIN_MENU ? omitSlot(session.slots, SlotKey.AWAITING_CONTINUE) : {};

  switch (action) {
    case "DROP_AND_WARN":
      return buildResult({ state: SessionState.MAIN_MENU, slots: { ...slots, [SlotKey.AWAITING_CONTINUE]: true }, counters: {} }, [
        sendButtons(institutionalWarningText(), CONTINUE_BUTTONS),
      ]);

    case "CITA_WITH_WARNING": {
      const hints = message ? extractCitaHints(message) : {};
      const withHints = {
        ...slots,
        ...(hints.especialidad ? { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: hints.especialidad } : {}),
        ...(hints.distrito ? { [SlotKey.CITA_DISTRITO_HINT_TEXT]: hints.distrito } : {}),
      };

      return buildResult({ state: SessionState.CITA_AWAITING_DNI, slots: withHints, counters: {} }, [sendText(CITA_WITH_WARNING_TEXT)]);
    }

    case "FORCE_INCIDENCIA": {
      const incidencia = serviceCatalog.byId(MenuChoice.REGISTRAR_INCIDENCIA);
      if (!incidencia.isEnabled()) return disabledServiceReply(incidencia, channelOf(session), slots);
      return beginIncidencia(slots, FORCED_INCIDENCIA_LEAD_TEXT);
    }
  }
}

export function applyLexicalGuard(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== InboundEventType.TEXT || !event.text) return undefined;

  const isMenuLevel = session.state === SessionState.MAIN_MENU || TERMINAL_STATES.has(session.state);
  const midFlowPrompt = FREE_TEXT_STATE_PROMPTS[session.state];
  const isSelection = SELECTION_STATES.has(session.state);
  const buttonReprompt = BUTTON_STATE_REPROMPTS[session.state];
  if (!isMenuLevel && midFlowPrompt === undefined && !isSelection && buttonReprompt === undefined) return undefined;

  const { action } = evaluateLexicalGuard(textoDeLaPersona(event.text));
  if (action === "ALLOW") return undefined;

  const verdict: TurnNote = { kind: "lexical_guard", level: "warn", detail: { action, state: session.state } };

  if (isMenuLevel) return withNote(routeLexicalAction({ ...session, channel: channelOf(session, event) }, action, event.text), verdict);

  if (isSelection) {
    const offered = readOffered(session.slots);
    return withNote(
      buildResult(session, [
        sendText(RESPECT_REMINDER_TEXT),
        ...(offered ? pageEffects(offered.text, offered.rows, session.counters[CounterKey.CITA_LIST_PAGE] ?? 0, offered.pageSize) : []),
      ]),
      verdict,
    );
  }

  if (buttonReprompt) {
    return withNote(buildResult(session, [sendText(RESPECT_REMINDER_TEXT), ...buttonReprompt(session).effects]), verdict);
  }

  return withNote(buildResult(session, [sendText(RESPECT_REMINDER_TEXT), sendText(midFlowPrompt)]), verdict);
}
