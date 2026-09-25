import {
  buildResult,
  omitSlot,
  sendButtons,
  sendList,
  sendText,
  TERMINAL_STATES,
  withNote,
} from "@/lib/fsm/core/handlers-shared";
import { extractCitaHints } from "@/lib/fsm/flows/cita/cita-hints";
import { readOffered } from "@/lib/fsm/parsing/selection-matchers";
import { RECLAMO_IDENTITY_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import {
  evaluateLexicalGuard,
  INSTITUTIONAL_WARNING_TEXT,
  RESPECT_REMINDER_TEXT,
  type LexicalAction,
} from "@/lib/security/lexical-guard";
import type { HandleEvent, HandlerResult, Session } from "@/lib/fsm/core/types";
import { CONTINUE_BUTTON_ID, AWAITING_CONTINUE_SLOT } from "@/lib/fsm/routing/main-menu";

const FREE_TEXT_STATE_PROMPTS: Record<string, string> = {
  cita_awaiting_distrito_ai: 'Cuéntanos en qué distrito buscas atención (ej. "Miraflores").',
  cita_awaiting_departamento: "Indícanos el departamento.",
  cita_awaiting_provincia: "¿En qué provincia?",
  cita_awaiting_distrito: "¿En qué distrito?",
};

const SELECTION_STATES = new Set([
  "cita_awaiting_distrito_disambiguation",
  "cita_awaiting_ubigeo_select",
  "cita_awaiting_especialidad_select",
  "cita_awaiting_establecimiento_select",
  "cita_awaiting_fecha_select",
  "cita_awaiting_hora_select",
  "cita_awaiting_hora_choice",
]);

export function routeLexicalAction(
  session: Session,
  action: Exclude<LexicalAction, "ALLOW">,
  message?: string,
): HandlerResult {
  const slots = session.state === "main_menu" ? omitSlot(session.slots, AWAITING_CONTINUE_SLOT) : {};

  switch (action) {
    case "DROP_AND_WARN":
      return buildResult({ state: "main_menu", slots: { ...slots, [AWAITING_CONTINUE_SLOT]: true }, counters: {} }, [
        sendButtons(INSTITUTIONAL_WARNING_TEXT, [{ id: CONTINUE_BUTTON_ID, title: "Continuar" }]),
      ]);

    case "CITA_WITH_WARNING": {
      const hints = message ? extractCitaHints(message) : {};
      const withHints = {
        ...slots,
        ...(hints.especialidad ? { citaEspecialidadHintText: hints.especialidad } : {}),
        ...(hints.distrito ? { citaDistritoHintText: hints.distrito } : {}),
      };

      return buildResult({ state: "cita_awaiting_dni", slots: withHints, counters: {} }, [
        sendText(`${RESPECT_REMINDER_TEXT} Continuemos con tu cita: ingresa tu número de documento (8 dígitos).`),
      ]);
    }

    case "FORCE_RECLAMO":
      return buildResult({ state: "reclamo_identity_choice", slots, counters: {} }, [
        sendButtons(
          "Lamentamos lo ocurrido. Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu documento de identidad a la mano?",
          RECLAMO_IDENTITY_BUTTONS,
        ),
      ]);
  }
}

export function applyLexicalGuard(session: Session, event: HandleEvent): HandlerResult | undefined {
  if (event.type !== "text" || !event.text) return undefined;

  const isMenuLevel = session.state === "main_menu" || TERMINAL_STATES.has(session.state);
  const midFlowPrompt = FREE_TEXT_STATE_PROMPTS[session.state];
  const isSelection = SELECTION_STATES.has(session.state);
  if (!isMenuLevel && midFlowPrompt === undefined && !isSelection) return undefined;

  const { action } = evaluateLexicalGuard(event.text);
  if (action === "ALLOW") return undefined;

  const verdict = { kind: "lexical_guard", level: "warn" as const, detail: { action, state: session.state } };

  if (isMenuLevel) return withNote(routeLexicalAction(session, action, event.text), verdict);

  if (isSelection) {
    const offered = readOffered(session.slots);
    return withNote(
      buildResult(session, [
        sendText(RESPECT_REMINDER_TEXT),
        ...(offered ? [sendList(offered.text, offered.rows)] : []),
      ]),
      verdict,
    );
  }

  return withNote(buildResult(session, [sendText(RESPECT_REMINDER_TEXT), sendText(midFlowPrompt)]), verdict);
}
