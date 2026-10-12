import { CLOCK_TIME } from "@/lib/constants/regex/text";
import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import type { HoraSlot } from "@/lib/fsm/parsing/date/time-parser";
import type { OfferedRow } from "@/lib/fsm/parsing/selection/selection-matchers";
import { nowInLima } from "@/lib/time/lima-clock";
import { MeridiemPeriod } from "@/lib/enums/meridiem-period";
import { cuposDisponiblesText } from "@/lib/constants/textos/cita-fecha-hora";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

export type HoraResultItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

export function orderHorasFromNow(citaFecha: string, items: HoraResultItem[]): HoraResultItem[] {
  const sorted = [...items].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const now = nowInLima();
  if (formatFechaForApi(citaFecha) !== now.fecha) return sorted;
  return sorted.filter((item) => item.horaInicio > now.hora);
}

export const ONLY_HORA_FLAG = "1";

export function slotToRow(slot: HoraSlot): OfferedRow {
  return {
    id: `${slot.start}|${slot.end}`,
    title: truncateForRow(formatHoraRange(slot.start, slot.end), WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(cuposDisponiblesText(slot.cupos), WHATSAPP_ROW_DESCRIPTION_MAX),
  };
}

export function rowToSlot(row: OfferedRow): HoraSlot | undefined {
  const [start, end] = row.id.split("|");
  return CLOCK_TIME.test(start ?? "") && CLOCK_TIME.test(end ?? "")
    ? { start, end, cupos: 0 }
    : undefined;
}

function clock12(time: string): { clock: string; period: MeridiemPeriod } {
  const [hour, minute] = time.split(":").map(Number);
  return {
    clock: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`,
    period: hour >= 12 ? MeridiemPeriod.PM : MeridiemPeriod.AM,
  };
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
  return `${hour % 12 || 12} ${hour >= 12 ? MeridiemPeriod.PM : MeridiemPeriod.AM}`;
}
