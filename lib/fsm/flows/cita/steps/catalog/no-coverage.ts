import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { looksLikePlaceName, resolveDistritoText } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { buildResult, cloneSession, omitSlot, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { DISCARDED_DATES_SLOT } from "@/lib/fsm/flows/cita/steps/fecha/other-fecha";
import { OFFERED_NAMES_SLOT, OFFERED_SLOT } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SearchSubject } from "@/lib/enums/search-subject";

export const OTHER_DISTRITO_STATE = "cita_awaiting_other_distrito";
const OTHER_DISTRITO_YES_ID = OtherDistritoButtonId.YES;
const OTHER_DISTRITO_NO_ID = OtherDistritoButtonId.NO;

const FAREWELL_TEXT =
  "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

const DISTRICT_BOUND_SLOTS = [
  "citaDistrito",
  "citaProvincia",
  "citaDepartamento",
  "citaUbigeo",
  "citaEspecialidadId",
  "citaCodEess",
  "citaEstablecimientoNombre",
  "citaEstablecimientosDescartados",
  "citaFecha",
  DISCARDED_DATES_SLOT,
  "citaDistritoHintText",
  "citaEstablecimientoHintText",
  "initialMessageText",
  OFFERED_SLOT,
  OFFERED_NAMES_SLOT,
];

const CHANGE_DISTRICT_ANSWERS = new Set(["CAMBIAR", "CAMBIAR DE DISTRITO", "OTRO DISTRITO", "OTRO", "BUSCAR OTRO DISTRITO"]);

const QUESTION = "¿Deseas buscar en otro distrito cercano?\n\n[1] Sí, buscar otro distrito\n[2] No, salir";

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: OTHER_DISTRITO_YES_ID, title: "Sí, otro distrito" },
    { id: OTHER_DISTRITO_NO_ID, title: "No, salir" },
  ]);

export function offerOtherDistrito(
  session: Session,
  missing: SearchSubject.ESPECIALIDADES | SearchSubject.ESTABLECIMIENTOS,
): HandlerResult {
  const next = cloneSession(session);
  next.state = OTHER_DISTRITO_STATE;

  const distrito = typeof next.slots.citaDistrito === "string" ? next.slots.citaDistrito.trim() : "";
  const where = distrito ? `en *${toDisplayPlace(distrito)}*` : "en tu zona";
  const what = missing === SearchSubject.ESPECIALIDADES ? "especialidades" : "establecimientos para esa especialidad";

  return withNote(
    buildResult(next, [questionButtons(`No encontramos ${what} disponibles ${where} en este momento.\n${QUESTION}`)]),
    { kind: "no_coverage", level: "warn", detail: { missing, distrito: distrito || "unknown" } },
  );
}

export function handleOtherDistrito(session: Session, event: InboundEvent): HandlerResult {
  const tapped =
    event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  const typed = event.type === InboundEventType.TEXT ? (event.text ?? "") : "";
  const answer =
    typed && CHANGE_DISTRICT_ANSWERS.has(normalizeText(typed)) ? Confirmation.YES : resolveConfirmation(typed);

  if (tapped === OTHER_DISTRITO_YES_ID || answer === Confirmation.YES) {
    const next = cloneSession(session);
    next.slots = DISTRICT_BOUND_SLOTS.reduce(omitSlot, next.slots);
    next.state = "cita_awaiting_distrito_ai";
    return buildResult(next, [
      sendText('Perfecto. Cuéntanos en qué otro distrito buscas atención (ej. "Miraflores").'),
    ]);
  }

  if (tapped === OTHER_DISTRITO_NO_ID || answer === Confirmation.NO) {
    return buildResult({ state: "cita_no_coverage_closed", slots: {}, counters: {} }, [sendText(FAREWELL_TEXT)]);
  }

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
