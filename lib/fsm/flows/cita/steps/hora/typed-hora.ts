import { buildResult, cloneSession, sendButtons, truncateForRow, WHATSAPP_LIST_MAX_ROWS } from "@/lib/fsm/core/handlers-shared";
import { matchHoraText, packHoraSlots, unpackHoraSlots, type HoraSlot } from "@/lib/fsm/parsing/time-parser";
import type { OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import type { Session } from "@/lib/fsm/core/types";
import type { CustomMatch } from "@/lib/fsm/flows/cita/selection";
import { formatHora12, slotToRow, rowToSlot, formatHourGroup } from "@/lib/fsm/flows/cita/steps/hora/format";

// ---- A bare "1".."10": list position or hour? ------------------------------
// "1" can be option 1 of the list (07:00) or 1 PM (13:00, MINSA speaks 24h).
// Both readings are checked against what is really offered:
//  - only the position exists            -> the position (then confirmed);
//  - only an hour exists ("8", no option 8) -> that hour (then confirmed);
//  - the same slot is both               -> just that slot (then confirmed);
//  - two different slots                 -> a two-button question naming both.
// The tapped button names an exact time, so it books directly like a list tap.

const BARE_SMALL_NUMBER = /^(?:[1-9]|10)$/;
export const HORA_CHOICE_A_ID = "hora_choice_a";
export const HORA_CHOICE_B_ID = "hora_choice_b";
export const BUTTON_TITLE_MAX = 20;

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


// A typed time ("a la 1", "1:45 pm", "en la tarde") is read against the WHOLE
// day MINSA offered; sessions without that (opened before it was stored) fall
// back to the rows currently on screen.
export function matchHoraTyped(session: Session, typed: string, rows: OfferedRow[]): CustomMatch | undefined {
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
