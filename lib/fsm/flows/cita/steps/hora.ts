import { offerOtherFecha } from "@/lib/fsm/flows/cita/steps/other-fecha";
import { isSlotAcceptance, resolveConfirmation } from "@/lib/fsm/parsing/confirmation-parser";
import { normalizeText } from "@/lib/fsm/parsing/text";
import {
  buildResult,
  cloneSession,
  offerList,
  query,
  sendText,
  sendButtons,
  truncateForRow,
  withNote,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
} from "@/lib/fsm/core/handlers-shared";
import { matchHoraText, packHoraSlots, unpackHoraSlots, type HoraSlot } from "@/lib/fsm/parsing/time-parser";
import { readOffered, type OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import type { HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import {
  type CustomMatch,
  NARROWED_LIST_TEXT,
  reshowOffered,
  clearOffered,
  resolveSelection,
} from "@/lib/fsm/flows/cita/selection";
import {
  type HoraResultItem,
  formatHora12,
  HORA_PAGE_PREV_ID,
  HORA_PAGE_NEXT_ID,
  orderHorasFromNow,
  slotToRow,
  rowToSlot,
  formatHourGroup,
  ONLY_HORA_FLAG,
  HORA_CONFIRM_YES_ID,
  HORA_CONFIRM_NO_ID,
} from "@/lib/fsm/flows/cita/hora-format";
import { beginReverification } from "@/lib/fsm/flows/cita/steps/reverification";

// Shared by handleHoraPending (page 0, computed from the query result it
// already has in hand) and handleHoraPagePending (any page, after
// re-querying list_horas since Session.slots only holds flat scalars, not
// the full candidate array, across turns).
function resolveHoraCandidates(session: Session, items: HoraResultItem[]): HandlerResult {
  const next = cloneSession(session);

  // A lone horario is never booked on its own: booking cannot be quietly undone,
  // and nobody chose this one. It goes through the same confirmation as a typed time.
  if (items.length === 1) {
    const [item] = items;
    return askHoraConfirmation(next, `${item.horaInicio}|${item.horaFin}`, { only: true });
  }

  if (items.length > 1) {
    next.state = "cita_awaiting_hora_select";
    const rows: ListRow[] = items.map((item) => ({
      id: `${item.horaInicio}|${item.horaFin}`,
      title: truncateForRow(`${formatHora12(item.horaInicio)} - ${formatHora12(item.horaFin)}`, WHATSAPP_ROW_TITLE_MAX),
      description: truncateForRow(
        `${item.cantidadCupos} cupo(s) disponibles`,
        WHATSAPP_ROW_DESCRIPTION_MAX,
      ),
    }));
    return buildResult(next, [offerList(next, "Selecciona el horario:", rows)]);
  }

  // Zero horarios for the date just picked — not a booking rejection (no
  // horario was ever offered to reject), and not a dead end either: the
  // citizen can pick another date, same as when they decline the day's only
  // horario (offerOtherFecha remembers this date as discarded so it's never
  // offered again).
  return offerOtherFecha(next, "no_horarios");
}

// Builds one page (≤10 rows) of an already-ordered candidate list, and
// appends a navigation buttons effect only when there's actually another
// page to move to in either direction — most days fit in one page and get
// no extra message at all.
function buildHoraPage(session: Session, orderedItems: HoraResultItem[], page: number): HandlerResult {
  const start = page * WHATSAPP_LIST_MAX_ROWS;
  const pageItems = orderedItems.slice(start, start + WHATSAPP_LIST_MAX_ROWS);

  const result = resolveHoraCandidates(session, pageItems);
  if (pageItems.length <= 1) return result; // a lone horario to confirm, or genuinely empty — nothing to paginate

  // The whole day's offer (not just this page) so a typed time on another
  // page can still be recognized — see handleAwaitingHoraSelect.
  result.session.slots.citaHorasDia = packHoraSlots(
    orderedItems.map((item) => ({ start: item.horaInicio, end: item.horaFin, cupos: item.cantidadCupos })),
  );

  const hasNext = start + WHATSAPP_LIST_MAX_ROWS < orderedItems.length;
  const hasPrev = page > 0;
  if (!hasNext && !hasPrev) return result;

  result.session.counters.citaHoraPage = page;
  const navButtons = [
    ...(hasPrev ? [{ id: HORA_PAGE_PREV_ID, title: "Horarios anteriores" }] : []),
    ...(hasNext ? [{ id: HORA_PAGE_NEXT_ID, title: "Ver más horarios" }] : []),
  ];
  result.effects.push(sendButtons("¿Quieres ver otros horarios de esta especialidad?", navButtons));
  return result;
}

export function handleHoraPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar horarios disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  return buildHoraPage(session, ordered, 0);
}

export function handleHoraPagePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; items?: HoraResultItem[] };

  if (result.status === "unauthorized") {
    return beginReverification(session, "cita_hora_pending");
  }

  if (result.status === "error") {
    const next = cloneSession(session);
    next.state = "cita_booking_rejected";
    return buildResult(next, [
      sendText(
        "Ocurrió un error al buscar horarios disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
      ),
    ]);
  }

  const ordered = orderHorasFromNow(String(session.slots.citaFecha ?? ""), result.items ?? []);
  const page = session.counters.citaHoraPage ?? 0;
  return buildHoraPage(session, ordered, page);
}

// ---- A bare "1".."10": list position or hour? ------------------------------
// "1" can be option 1 of the list (07:00) or 1 PM (13:00, MINSA speaks 24h).
// Both readings are checked against what is really offered:
//  - only the position exists            -> the position (then confirmed);
//  - only an hour exists ("8", no option 8) -> that hour (then confirmed);
//  - the same slot is both               -> just that slot (then confirmed);
//  - two different slots                 -> a two-button question naming both.
// The tapped button names an exact time, so it books directly like a list tap.

const BARE_SMALL_NUMBER = /^(?:[1-9]|10)$/;
const HORA_CHOICE_A_ID = "hora_choice_a";
const HORA_CHOICE_B_ID = "hora_choice_b";
const BUTTON_TITLE_MAX = 20;

function resolveBareHoraNumber(
  session: Session,
  number: number,
  visibleRows: OfferedRow[],
  daySlots: HoraSlot[],
): CustomMatch | undefined {
  const positionRow = number <= visibleRows.length ? visibleRows[number - 1] : undefined;
  const hourSlots = daySlots.filter((slot) => {
    const hour = Number(slot.start.slice(0, 2));
    return hour === number || hour === number + 12;
  });
  const otherHourSlots = positionRow ? hourSlots.filter((slot) => slotToRow(slot).id !== positionRow.id) : hourSlots;

  if (otherHourSlots.length === 0) {
    // Position only (or the position is itself the sole matching hour); with
    // neither, undefined lets the generic matcher reject it.
    return positionRow ? { kind: "match", row: positionRow } : undefined;
  }

  if (!positionRow) {
    return otherHourSlots.length === 1
      ? { kind: "match", row: slotToRow(otherHourSlots[0]) }
      : { kind: "ambiguous", rows: otherHourSlots.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow) };
  }

  const positionSlot = rowToSlot(positionRow);
  if (!positionSlot) return { kind: "match", row: positionRow };

  const first = otherHourSlots[0];
  const single = otherHourSlots.length === 1;
  const hourLabel = single ? `${formatHora12(first.start)}: ${first.start}` : `${formatHourGroup(first.start)}: ver horas`;
  const hourDescription = single
    ? `${formatHora12(first.start)} (${first.start})`
    : `${formatHourGroup(first.start)} (${otherHourSlots.map((slot) => slot.start).join(", ")})`;

  const next = cloneSession(session);
  next.state = "cita_awaiting_hora_choice";
  next.slots.citaHoraChoiceA = positionRow.id;
  next.slots.citaHoraChoiceB = packHoraSlots(otherHourSlots);

  return {
    kind: "handled",
    result: buildResult(next, [
      sendButtons(`¿A qué te refieres con "${number}"? Opción ${number}: ${positionSlot.start}, o ${hourDescription}.`, [
        { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción ${number}: ${positionSlot.start}`, BUTTON_TITLE_MAX) },
        { id: HORA_CHOICE_B_ID, title: truncateForRow(hourLabel, BUTTON_TITLE_MAX) },
      ]),
    ]),
  };
}

export function handleHoraChoice(session: Session, event: InboundEvent): HandlerResult {
  const slotA = String(session.slots.citaHoraChoiceA ?? "");
  const slotsB = unpackHoraSlots(session.slots.citaHoraChoiceB);
  const offered = readOffered(session.slots);

  const back = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraChoiceA;
    delete restored.slots.citaHoraChoiceB;
    restored.state = "cita_awaiting_hora_select";
    return restored;
  };

  // Typing instead of tapping: a normal typed time, read against the full list.
  if (event.type === "text") return handleAwaitingHoraSelect(back(), event);

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;

  if (reply === HORA_CHOICE_A_ID && /^\d{2}:\d{2}\|/.test(slotA)) {
    return startBooking(back(), slotA.split("|")[0]);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length === 1) {
    return startBooking(back(), slotsB[0].start);
  }

  if (reply === HORA_CHOICE_B_ID && slotsB.length > 1) {
    const restored = back();
    return buildResult(restored, [offerList(restored, NARROWED_LIST_TEXT, slotsB.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow))]);
  }

  // Anything else: ask again with the same two options.
  const [startA] = slotA.split("|");
  const first = slotsB[0];
  if (!/^\d{2}:\d{2}$/.test(startA ?? "") || !first) return reshowOffered(back(), offered);

  return buildResult(session, [
    sendButtons("Elige una de las dos opciones:", [
      { id: HORA_CHOICE_A_ID, title: truncateForRow(`Opción: ${startA}`, BUTTON_TITLE_MAX) },
      {
        id: HORA_CHOICE_B_ID,
        title: truncateForRow(slotsB.length === 1 ? `${formatHora12(first.start)}: ${first.start}` : "Ver horas", BUTTON_TITLE_MAX),
      },
    ]),
  ]);
}

// A typed time ("a la 1", "1:45 pm", "en la tarde") is read against the WHOLE
// day MINSA offered; sessions without that (opened before it was stored) fall
// back to the rows currently on screen.
function matchHoraTyped(session: Session, typed: string, rows: OfferedRow[]): CustomMatch | undefined {
  const day = unpackHoraSlots(session.slots.citaHorasDia);
  const slots = day.length > 0 ? day : rows.flatMap((row) => rowToSlot(row) ?? []);

  if (BARE_SMALL_NUMBER.test(typed.trim())) {
    const decided = resolveBareHoraNumber(session, Number(typed.trim()), rows, slots);
    if (decided) return decided;
    // No hour matches: fall through so the generic matcher reads it as a position.
  }

  const match = matchHoraText(typed, slots);
  switch (match.kind) {
    case "exact":
      return { kind: "match", row: slotToRow(match.slot) };
    case "several":
      return { kind: "ambiguous", rows: match.slots.slice(0, WHATSAPP_LIST_MAX_ROWS).map(slotToRow) };
    case "unavailable":
      return { kind: "notice", text: "No hay horarios disponibles a esa hora. Elige uno de la lista:" };
    case "unparsed":
      return undefined;
  }
}

// Booking is the one step that can't be quietly undone, so a time that came
// from typed text — or the only one there is — is confirmed first. Tapping a
// list row books directly.
//
// `only` marks "this is the only horario on offer, nobody picked it": the
// question says so, and a "no" has no list of the same day to go back to.
function askHoraConfirmation(session: Session, slotId: string, options: { only?: boolean } = {}): HandlerResult {
  const [start, end] = slotId.split("|");
  const next = cloneSession(session);
  next.state = "cita_awaiting_hora_confirm";
  // citaHoraConfirmId keeps the RAW 24h slot (start|end): it is what gets booked
  // and what startBooking/handleHoraConfirm read back. Only the sentence below
  // is reformatted for the citizen — via formatHora12, in 12h with AM/PM.
  next.slots.citaHoraConfirmId = slotId;
  if (options.only) next.slots.citaHoraConfirmOnly = ONLY_HORA_FLAG;
  else delete next.slots.citaHoraConfirmOnly;

  const range = `${formatHora12(start)} - ${formatHora12(end)}`;
  return buildResult(next, [
    options.only
      ? sendButtons(`Solo hay un horario disponible: ${range}. ¿Lo confirmas?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, gracias" },
        ])
      : sendButtons(`¿Confirmas el horario ${range}?`, [
          { id: HORA_CONFIRM_YES_ID, title: "Sí, confirmar" },
          { id: HORA_CONFIRM_NO_ID, title: "No, ver horarios" },
        ]),
  ]);
}

function startBooking(session: Session, horaInicio: string): HandlerResult {
  const next = clearOffered(session);
  delete next.slots.citaHorasDia;
  delete next.slots.citaHoraConfirmId;
  delete next.slots.citaHoraConfirmOnly;
  delete next.slots.citaHoraChoiceA;
  delete next.slots.citaHoraChoiceB;
  next.state = "cita_booking_pending";
  return buildResult(next, [
    sendText("Agendando tu cita…"),
    query("book_appointment", {
      codigoRenipress: String(next.slots.citaCodEess ?? ""),
      codigoUps: String(next.slots.citaEspecialidadId ?? ""),
      fechaCita: String(next.slots.citaFecha ?? ""),
      horaInicio,
      numeroDocumentoPaciente: String(next.slots.citaDni ?? ""),
    }),
  ]);
}

const NEGATION_WORD = /\b(?:no|ni|nunca|tampoco)\b/;

// The citizen typed the hour that is waiting for confirmation ("a la 1", "13:00")
// or said they take it ("esa hora", "me sirve"). Any negation cancels the reading,
// so "no a la 1" never books.
function acceptsPendingHora(typed: string, slotId: string): boolean {
  const plain = normalizeText(typed).toLowerCase();
  if (NEGATION_WORD.test(plain)) return false;
  if (isSlotAcceptance(typed)) return true;

  const [start, end] = slotId.split("|");
  return matchHoraText(typed, [{ start, end, cupos: 0 }]).kind === "exact";
}

export function handleHoraConfirm(session: Session, event: InboundEvent): HandlerResult {
  const slotId = String(session.slots.citaHoraConfirmId ?? "");
  const [start] = slotId.split("|");
  const only = session.slots.citaHoraConfirmOnly === ONLY_HORA_FLAG;
  const offered = readOffered(session.slots);

  const backToList = () => {
    const restored = cloneSession(session);
    delete restored.slots.citaHoraConfirmId;
    delete restored.slots.citaHoraConfirmOnly;

    if (only) {
      // The lone horario was the last page: its list is the previous page's, so
      // the page steps back with it. Without a previous page there is no list of
      // this day to go back to: the citizen is offered another date instead.
      const page = restored.counters.citaHoraPage ?? 0;
      if (!offered || page < 1) return offerOtherFecha(restored);
      restored.counters.citaHoraPage = page - 1;
    }

    restored.state = "cita_awaiting_hora_select";
    return reshowOffered(restored, offered, "Sin problema. Elige otro horario:");
  };

  if (!/^\d{2}:\d{2}$/.test(start ?? "")) return backToList();

  const reply = event.type === "button" || event.type === "list" ? event.listId : undefined;
  const typedText = event.type === "text" ? (event.text ?? "") : "";
  const typed = event.type === "text" ? resolveConfirmation(typedText) : "UNKNOWN";
  const takesThatHora = typed === "UNKNOWN" && event.type === "text" && acceptsPendingHora(typedText, slotId);

  if (reply === HORA_CONFIRM_YES_ID || typed === "YES" || takesThatHora) return startBooking(session, start);
  if (reply === HORA_CONFIRM_NO_ID || typed === "NO") return backToList();

  return withNote(askHoraConfirmation(session, slotId, { only }), {
    kind: "confirmation_unknown",
    level: "warn",
    detail: { step: "hora_confirm" },
  });
}

export function handleAwaitingHoraSelect(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event, {
    passthroughIds: [HORA_PAGE_NEXT_ID, HORA_PAGE_PREV_ID],
    customMatch: (typed, rows) => matchHoraTyped(session, typed, rows),
  });
  if ("result" in outcome) return outcome.result;
  const replyId = outcome.replyId;

  if (replyId === HORA_PAGE_NEXT_ID || replyId === HORA_PAGE_PREV_ID) {
    const next = cloneSession(session);
    const currentPage = next.counters.citaHoraPage ?? 0;
    next.counters.citaHoraPage = Math.max(0, currentPage + (replyId === HORA_PAGE_NEXT_ID ? 1 : -1));
    next.state = "cita_hora_page_pending";
    return buildResult(next, [
      sendText("Buscando más horarios…"),
      query("list_horas", {
        codEess: String(next.slots.citaCodEess ?? ""),
        especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        fecha: String(next.slots.citaFecha ?? ""),
      }),
    ]);
  }

  if (!replyId || !replyId.includes("|")) {
    return buildResult(session, [sendText("Selecciona una opción de la lista.")]);
  }

  // Typed text (a time or a list position) is confirmed before booking; a tap
  // on a list row is already an explicit choice.
  if (outcome.typed !== undefined) return askHoraConfirmation(session, replyId);

  const [horaInicio] = replyId.split("|");
  return startBooking(session, horaInicio);
}
