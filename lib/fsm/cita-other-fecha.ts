import { resolveConfirmation } from "./confirmation-parser";
import { normalizeText } from "./domain";
import { buildResult, cloneSession, query, sendButtons, sendText, withNote } from "./handlers-shared";
import { OFFERED_SLOT } from "./selection-matchers";
import type { HandlerResult, InboundEvent, Session } from "./types";

// The citizen declined the ONLY horario of a day, so there is no list of that
// day to go back to. They are not sent away: they are asked whether they want
// another DATE, and the conversation only ends (with an apology and a goodbye)
// if they say no or if there is no other date left.
//
// The dates already declined are remembered, so the dates that come back never
// offer them again. That is what keeps a day with a single date (or two days with
// one horario each) from looping on the same question.

export const OTHER_FECHA_STATE = "cita_awaiting_other_fecha";
export const DECLINED_CLOSED_STATE = "cita_declined_closed";
export const DISCARDED_DATES_SLOT = "citaFechasDescartadas";

const OTHER_FECHA_YES_ID = "cita_otra_fecha_si";
const OTHER_FECHA_NO_ID = "cita_otra_fecha_no";

const FAREWELL = "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Cuando quieras volver a intentarlo, escríbenos nuevamente. ¡Que tengas un buen día! 👋";
const DECLINED_TEXT = `Lamentamos no haber encontrado un horario que se ajuste a lo que necesitas. ${FAREWELL}`;
const NO_OTHER_DATES_TEXT = `Lamentamos informarte que por ahora no hay otras fechas disponibles en este establecimiento. ${FAREWELL}`;

const INTRO_ONLY_DECLINED = "Entendido, ese horario no te conviene. Como era el único horario disponible para esa fecha, te recomiendo elegir otra fecha.";
// Same wording the citizen already sees when list_horas comes back empty
// (resolveHoraCandidates in handlers-cita.ts) — kept identical on purpose so
// the two callers of offerOtherFecha read as one consistent message, not two.
const INTRO_NO_HORARIOS = "No hay horarios disponibles para esa fecha.";
const QUESTION = "¿Deseas cambiar de fecha?\n\n[1] Sí, cambiar de fecha\n[2] No, salir";

// Slots that belong to the date being left behind. The verification (token, DNI)
// and the establishment and specialty stay: the citizen has not asked to start over.
const DATE_BOUND_SLOTS = ["citaFecha", "citaHoraConfirmId", "citaHoraConfirmOnly", "citaHorasDia", OFFERED_SLOT];

// "otra fecha" or "cambiar" mean YES here, while the generic reader takes
// "otro día" and "cambiar" as a NO (they are a "no" to a horario).
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

// Slots hold flat values only, so the declined dates are one comma-separated string.
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

// "only_declined": the citizen was shown the day's ONLY horario and turned
// it down. "no_horarios": list_horas came back empty for the date they just
// picked — there was never anything to show. Same next question either way
// (want another date?), different reason for asking it.
export function offerOtherFecha(session: Session, reason: "only_declined" | "no_horarios" = "only_declined"): HandlerResult {
  const next = cloneSession(session);

  const declined = String(next.slots.citaFecha ?? "");
  const discarded = declined ? [...new Set([...discardedDates(next.slots), declined])] : discardedDates(next.slots);
  if (discarded.length > 0) next.slots[DISCARDED_DATES_SLOT] = discarded.join(",");

  for (const slot of DATE_BOUND_SLOTS) delete next.slots[slot];
  delete next.counters.citaHoraPage;
  next.state = OTHER_FECHA_STATE;

  const intro = reason === "no_horarios" ? INTRO_NO_HORARIOS : INTRO_ONLY_DECLINED;
  return withNote(buildResult(next, [questionButtons(`${intro}\n${QUESTION}`)]), {
    kind: "hora_declined",
    detail: { step: reason === "no_horarios" ? "hora_pending" : "hora_confirm", only: reason === "only_declined", declinedDates: discarded.length },
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
