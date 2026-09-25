import { resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text";
import { buildResult, cloneSession, query, sendButtons, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { OFFERED_SLOT } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";

export const OTHER_FECHA_STATE = "cita_awaiting_other_fecha";
export const DECLINED_CLOSED_STATE = "cita_declined_closed";
export const DISCARDED_DATES_SLOT = "citaFechasDescartadas";

const OTHER_FECHA_YES_ID = "cita_otra_fecha_si";
const OTHER_FECHA_NO_ID = "cita_otra_fecha_no";

const FAREWELL = "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";
const DECLINED_TEXT = `Entendido, no buscaremos otra fecha por ahora. ${FAREWELL}`;
const NO_OTHER_DATES_TEXT = `Lamentamos informarte que por ahora no hay otras fechas disponibles en este establecimiento. ${FAREWELL}`;

const INTRO_ONLY_DECLINED = "Entendido, ese horario no te conviene. Como era el único horario disponible para esa fecha, te recomiendo elegir otra fecha.";
const INTRO_NO_HORARIOS = "No hay horarios disponibles para esa fecha.";
const INTRO_DUPLICATE = "Ya tienes una cita activa registrada para ese mismo turno o servicio.";
const QUESTION = "¿Deseas cambiar de fecha?\n\n[1] Sí, cambiar de fecha\n[2] No, salir";

const DATE_BOUND_SLOTS = ["citaFecha", "citaHoraConfirmId", "citaHoraConfirmOnly", "citaHorasDia", OFFERED_SLOT];

const CHANGE_DATE_ANSWERS = new Set([
  "CAMBIAR",
  "CAMBIAR FECHA",
  "CAMBIAR DE FECHA",
  "OTRA FECHA",
  "OTRA",
  "OTRO DIA",
  "OTRO",
  "VER OTRAS FECHAS",
  "BUSCAR OTRA FECHA",
]);

const questionButtons = (text: string) =>
  sendButtons(text, [
    { id: OTHER_FECHA_YES_ID, title: "Sí, otra fecha" },
    { id: OTHER_FECHA_NO_ID, title: "No, salir" },
  ]);

export function discardedDates(slots: Session["slots"]): string[] {
  return String(slots[DISCARDED_DATES_SLOT] ?? "")
    .split(",")
    .filter(Boolean);
}

export function closeWithApology(reason: "declined" | "no_other_dates"): HandlerResult {
  return withNote(
    buildResult({ state: DECLINED_CLOSED_STATE, slots: {}, counters: {} }, [
      sendText(reason === "declined" ? DECLINED_TEXT : NO_OTHER_DATES_TEXT),
    ]),
    { kind: "cita_closed", detail: { reason } },
  );
}

export type OfferOtherFechaReason = "only_declined" | "no_horarios" | "duplicate";

const INTRO_BY_REASON: Record<OfferOtherFechaReason, string> = {
  only_declined: INTRO_ONLY_DECLINED,
  no_horarios: INTRO_NO_HORARIOS,
  duplicate: INTRO_DUPLICATE,
};

const STEP_BY_REASON: Record<OfferOtherFechaReason, string> = {
  only_declined: "hora_confirm",
  no_horarios: "hora_pending",
  duplicate: "booking_pending",
};

export function offerOtherFecha(session: Session, reason: OfferOtherFechaReason = "only_declined"): HandlerResult {
  const next = cloneSession(session);

  const declined = String(next.slots.citaFecha ?? "");
  const discarded = declined ? [...new Set([...discardedDates(next.slots), declined])] : discardedDates(next.slots);
  if (discarded.length > 0) next.slots[DISCARDED_DATES_SLOT] = discarded.join(",");

  for (const slot of DATE_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters.citaHoraPage;
  next.state = OTHER_FECHA_STATE;

  return withNote(buildResult(next, [questionButtons(`${INTRO_BY_REASON[reason]}\n${QUESTION}`)]), {
    kind: "hora_declined",
    detail: { step: STEP_BY_REASON[reason], only: reason === "only_declined", declinedDates: discarded.length },
  });
}

export function handleOtherFecha(session: Session, event: InboundEvent): HandlerResult {
  const tapped = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typed = event.type === "text" ? (event.text ?? "") : "";
  const answer = typed && CHANGE_DATE_ANSWERS.has(normalizeText(typed)) ? "YES" : resolveConfirmation(typed);

  if (tapped === OTHER_FECHA_YES_ID || answer === "YES") {
    const next = cloneSession(session);
    next.state = "cita_fecha_pending";
    return buildResult(next, [
      sendText("Buscando otras fechas disponibles…"),
      query("list_fechas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
      }),
    ]);
  }

  if (tapped === OTHER_FECHA_NO_ID || answer === "NO") return closeWithApology("declined");

  return withNote(buildResult(session, [questionButtons(QUESTION)]), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "other_fecha" },
  });
}
