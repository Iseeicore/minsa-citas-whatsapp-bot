import { truncateForRow, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import type { HoraSlot } from "@/lib/fsm/parsing/time-parser";
import type { OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import { nowInLima } from "@/lib/fsm/flows/cita/lima-clock";

// ---- Hora --------------------------------------------------------------

export type HoraResultItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

export const HORA_PAGE_NEXT_ID = "hora_pagina_siguiente";
export const HORA_PAGE_PREV_ID = "hora_pagina_anterior";

// Sorted chronologically and, when the citizen's chosen date is today,
// anchored to the current time — a slot that already started can't be
// booked. Any other (future) date shows the full day from its first slot.
export function orderHorasFromNow(citaFecha: string, items: HoraResultItem[]): HoraResultItem[] {
  const sorted = [...items].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const now = nowInLima();
  if (formatFechaForApi(citaFecha) !== now.fecha) return sorted;
  return sorted.filter((item) => item.horaInicio > now.hora);
}

export const HORA_CONFIRM_YES_ID = "hora_confirm_si";
export const HORA_CONFIRM_NO_ID = "hora_confirm_no";
// Slots hold flat scalars only: this marks a confirmation of the day's only horario.
export const ONLY_HORA_FLAG = "1";

export function slotToRow(slot: HoraSlot): OfferedRow {
  return {
    id: `${slot.start}|${slot.end}`,
    title: truncateForRow(`${slot.start} - ${slot.end}`, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${slot.cupos} cupo(s) disponibles`, WHATSAPP_ROW_DESCRIPTION_MAX),
  };
}

export function rowToSlot(row: OfferedRow): HoraSlot | undefined {
  const [start, end] = row.id.split("|");
  return /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "")
    ? { start, end, cupos: 0 }
    : undefined;
}

export function formatHora12(start: string): string {
  const [hour, minute] = start.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

// "13:00" -> "1 PM" (the hour on its own, for a group of slots).
export function formatHourGroup(start: string): string {
  const hour = Number(start.slice(0, 2));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
}
