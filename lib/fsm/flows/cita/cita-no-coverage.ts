import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text";
import { looksLikePlaceName, resolveDistritoText } from "@/lib/fsm/flows/cita/distrito-resolver";
import { buildResult, cloneSession, omitSlot, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { DISCARDED_DATES_SLOT } from "@/lib/fsm/flows/cita/cita-other-fecha";
import { OFFERED_SLOT } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";

// MINSA answered with nothing for the district the citizen chose. That is not
// the end of the conversation: the state stays open and they are offered another
// district, instead of a closed flow that answers their next message with the
// welcome all over again.

export const OTHER_DISTRITO_STATE = "cita_awaiting_other_distrito";
const OTHER_DISTRITO_YES_ID = "cita_otro_distrito_si";
const OTHER_DISTRITO_NO_ID = "cita_otro_distrito_no";

const FAREWELL_TEXT =
  "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

// Slots that only make sense for the district being left behind. The
// verification (token, DNI) stays: the citizen has not asked to start over.
const DISTRICT_BOUND_SLOTS = [
  "citaDistrito",
  "citaProvincia",
  "citaDepartamento",
  "citaUbigeo",
  "citaEspecialidadId",
  "citaCodEess",
  "citaFecha",
  DISCARDED_DATES_SLOT, // dates declined at the old place mean nothing at the new one
  "citaDistritoHintText",
  "citaEstablecimientoHintText",
  "initialMessageText", // would be used as "context" and bring the old district back
  OFFERED_SLOT,
];

// "cambiar" means "change the district" here, but "no" in a horario confirmation.
const CHANGE_DISTRICT_ANSWERS = new Set(["CAMBIAR", "CAMBIAR DE DISTRITO", "OTRO DISTRITO", "OTRO", "BUSCAR OTRO DISTRITO"]);

const QUESTION = "¿Deseas buscar en otro distrito cercano?\n\n[1] Sí, buscar otro distrito\n[2] No, salir";

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: OTHER_DISTRITO_YES_ID, title: "Sí, otro distrito" },
    { id: OTHER_DISTRITO_NO_ID, title: "No, salir" },
  ]);

export function offerOtherDistrito(session: Session, missing: "especialidades" | "establecimientos"): HandlerResult {
  const next = cloneSession(session);
  next.state = OTHER_DISTRITO_STATE;

  const distrito = typeof next.slots.citaDistrito === "string" ? next.slots.citaDistrito.trim() : "";
  const where = distrito ? `en *${toDisplayPlace(distrito)}*` : "en tu zona";
  const what = missing === "especialidades" ? "especialidades" : "establecimientos para esa especialidad";

  return withNote(
    buildResult(next, [questionButtons(`No encontramos ${what} disponibles ${where} en este momento.\n${QUESTION}`)]),
    { kind: "no_coverage", level: "warn", detail: { missing, distrito: distrito || "unknown" } },
  );
}

export function handleOtherDistrito(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? (event.text ?? "") : "";
  const answer = typed && CHANGE_DISTRICT_ANSWERS.has(normalizeText(typed)) ? "YES" : resolveConfirmation(typed);

  if (tapped === OTHER_DISTRITO_YES_ID || answer === "YES") {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    next.state = "cita_awaiting_distrito_ai";
    return buildResult(next, [
      sendText('Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").'),
    ]);
  }

  if (tapped === OTHER_DISTRITO_NO_ID || answer === "NO") {
    return buildResult({ state: "cita_no_coverage_closed", slots: {}, counters: {} }, [sendText(FAREWELL_TEXT)]);
  }

  // Neither a tap nor a plain yes/no word (those are both handled above,
  // "dale"/"cambiar" included): a reply that already NAMES a district
  // ("Si quiero en San Borja", or just "San Borja") answers the "sí, ¿cuál?"
  // exchange in one message, so it is resolved directly here (local dataset,
  // then the AI if that finds nothing) instead of asking "Perfecto,
  // cuéntanos..." and making the citizen repeat themselves. "quee ?" and other
  // noise never look like a place name, so they still fall through unchanged.
  if (typed && looksLikePlaceName(typed)) {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    return resolveDistritoText(next, typed, undefined);
  }

  return withNote(buildResult(session, [questionButtons(QUESTION)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_distrito" },
  });
}
