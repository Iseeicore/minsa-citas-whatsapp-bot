import { truncateForRow, WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import type { HoraSlot } from "@/lib/fsm/parsing/time-parser";
import type { OfferedRow } from "@/lib/fsm/parsing/selection-matchers";
import { nowInLima } from "@/lib/time/lima-clock";

export type HoraResultItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

export const HORA_PAGE_NEXT_ID = "hora_pagina_siguiente";
export const HORA_PAGE_PREV_ID = "hora_pagina_anterior";

export function orderHorasFromNow(citaFecha: string, items: HoraResultItem[]): HoraResultItem[] {
  const sorted = [...items].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const now = nowInLima();
  if (formatFechaForApi(citaFecha) !== now.fecha) return sorted;
  return sorted.filter((item) => item.horaInicio > now.hora);
}

export const HORA_CONFIRM_YES_ID = "hora_confirm_si";
export const HORA_CONFIRM_NO_ID = "hora_confirm_no";
export const ONLY_HORA_FLAG = "1";

export function slotToRow(slot: HoraSlot): OfferedRow {
  return {
    id: `${slot.start}|${slot.end}`,
    title: truncateForRow(formatHoraRange(slot.start, slot.end), WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${slot.cupos} cupo(s) disponibles`, WHATSAPP_ROW_DESCRIPTION_MAX),
  };
}

export function rowToSlot(row: OfferedRow): HoraSlot | undefined {
  const [start, end] = row.id.split("|");
  return /^\d{2}:\d{2}$/.test(start ?? "") && /^\d{2}:\d{2}$/.test(end ?? "")
    ? { start, end, cupos: 0 }
    : undefined;
}

function clock12(time: string): { clock: string; period: "AM" | "PM" } {
  const [hour, minute] = time.split(":").map(Number);
  return { clock: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`, period: hour >= 12 ? "PM" : "AM" };
}

export function formatHora12(start: string): string {
  const { clock, period } = clock12(start);
  return `${clock} ${period}`;
}

export function formatHoraRange(start: string, end: string): string {
  const from = clock12(start);
  const to = clock12(end);
  return from.period === to.period
    ? `${from.clock} - ${to.clock} ${to.period}`
    : `${from.clock} ${from.period} - ${to.clock} ${to.period}`;
}

export function formatHourGroup(start: string): string {
  const hour = Number(start.slice(0, 2));
  return `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`;
}
