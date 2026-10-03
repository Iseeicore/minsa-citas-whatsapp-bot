import {
  buildResult,
  omitSlot,
  pageEffects,
  sendButtons,
  sendText,
  TERMINAL_STATES,
  withNote,
} from "@/lib/fsm/core/handlers-shared";
import { extractCitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { RECLAMO_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import {
  evaluateLexicalGuard,
  INSTITUTIONAL_WARNING_TEXT,
  RESPECT_REMINDER_TEXT,
  type LexicalAction,
} from "@/lib/security/lexical-guard";
import type { HandleEvent, HandlerResult, Session } from "@/lib/fsm/core/types";
import type { TurnNote } from "@/lib/observability/types";
import { CONTINUE_BUTTON_ID } from "@/lib/fsm/routing/main-menu";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const FREE_TEXT_STATE_PROMPTS: Record<string, string> = {
  [SessionState.CITA_AWAITING_DISTRITO_AI]: 'Cuéntanos en qué distrito buscas atención (ej. "Miraflores").',
  [SessionState.CITA_AWAITING_DEPARTAMENTO]: "Indícanos el departamento.",
  [SessionState.CITA_AWAITING_PROVINCIA]: "¿En qué provincia?",
  [SessionState.CITA_AWAITING_DISTRITO]: "¿En qué distrito?",
};

const SELECTION_STATES: ReadonlySet<string> = new Set<Session["state"]>([
  SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION,
  SessionState.CITA_AWAITING_UBIGEO_SELECT,
  SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT,
  SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT,
  SessionState.CITA_AWAITING_FECHA_SELECT,
  SessionState.CITA_AWAITING_HORA_SELECT,
  SessionState.CITA_AWAITING_HORA_CHOICE,
]);

export function routeLexicalAction(
  session: Session,
  action: Exclude<LexicalAction, "ALLOW">,
  message?: string,
): HandlerResult {
  const slots = session.state === SessionState.MAIN_MENU ? omitSlot(session.slots, SlotKey.AWAITING_CONTINUE) : {};

  switch (action) {
    case "DROP_AND_WARN":
      return buildResult({ state: SessionState.MAIN_MENU, slots: { ...slots, [SlotKey.AWAITING_CONTINUE]: true }, counters: {} }, [
        sendButtons(INSTITUTIONAL_WARNING_TEXT, [{ id: CONTINUE_BUTTON_ID, title: "Continuar" }]),
      ]);

    case "CITA_WITH_WARNING": {
      const hints = message ? extractCitaHints(message) : {};
      const withHints = {
        ...slots,
        ...(hints.especialidad ? { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: hints.especialidad } : {}),
        ...(hints.distrito ? { [SlotKey.CITA_DISTRITO_HINT_TEXT]: hints.distrito } : {}),
      };

      return buildResult({ state: SessionState.CITA_AWAITING_DNI, slots: withHints, counters: {} }, [
        sendText(`${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu número de documento (8 dígitos).`),
      ]);
    }

    case "FORCE_RECLAMO":
      return buildResult({ state: SessionState.RECLAMO_IDENTITY_CHOICE, slots, counters: {} }, [
        sendButtons(
          "Lamentamos lo ocurrido. Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Deseas registrar tu nombre, o prefieres que sea anónimo?",
          RECLAMO_NOMBRE_BUTTONS,
        ),
      ]);
  }
}

export function applyLexicalGuard(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== "text" || !event.text) return undefined;

  const isMenuLevel = session.state === SessionState.MAIN_MENU || TERMINAL_STATES.has(session.state);
  const midFlowPrompt = FREE_TEXT_STATE_PROMPTS[session.state];
  const isSelection = SELECTION_STATES.has(session.state);
  if (!isMenuLevel && midFlowPrompt === undefined && !isSelection) return undefined;

  const { action } = evaluateLexicalGuard(event.text);
  if (action === "ALLOW") return undefined;

  const verdict: TurnNote = { kind: "lexical_guard", level: "warn", detail: { action, state: session.state } };

  if (isMenuLevel) return withNote(routeLexicalAction(session, action, event.text), verdict);

  if (isSelection) {
    const offered = readOffered(session.slots);
    return withNote(
      buildResult(session, [
        sendText(RESPECT_REMINDER_TEXT),
        ...(offered ? pageEffects(offered.text, offered.rows, session.counters[CounterKey.CITA_LIST_PAGE] ?? 0) : []),
      ]),
      verdict,
    );
  }

  return withNote(buildResult(session, [sendText(RESPECT_REMINDER_TEXT), sendText(midFlowPrompt)]), verdict);
}
