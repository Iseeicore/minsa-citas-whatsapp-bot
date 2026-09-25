import { buildResult, cloneSession, sendButtons, truncateForRow, WHATSAPP_LIST_MAX_ROWS } from "@/lib/fsm/core/handlers-shared";
import { matchHoraText, packHoraSlots, unpackHoraSlots, type HoraSlot } from "@/lib/fsm/parsing/time-parser";
import type { OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import type { Session } from "@/lib/fsm/core/types";
import type { CustomMatch } from "@/lib/fsm/flows/cita/selection";
import { formatHora12, slotToRow, rowToSlot, formatHourGroup } from "@/lib/fsm/flows/cita/steps/hora/format";

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


export function matchHoraTyped(session: Session, typed: string, rows: OfferedRow[]): CustomMatch | undefined {
  const day = unpackHoraSlots(session.slots.citaHorasDia);
  const slots = day.length > 0 ? day : rows.flatMap((row) => rowToSlot(row) ?? []);

  if (BARE_SMALL_NUMBER.test(typed.trim())) {
    const decided = resolveBareHoraNumber(session, Number(typed.trim()), rows, slots);
    if (decided) return decided;
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
