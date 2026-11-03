import type { DateParts } from "@/lib/fsm/parsing/date/date-parser";

export const LIMA_TIME_ZONE = "America/Lima";

export function todayInLima(): DateParts {
  const fecha = nowInLima().fecha;
  return {
    year: Number(fecha.slice(0, 4)),
    month: Number(fecha.slice(4, 6)),
    day: Number(fecha.slice(6, 8)),
  };
}

function readInLima(instant: Date, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).formatToParts(instant);
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
}

export function startOfTodayInLima(now: Date = new Date()): Date {
  const get = readInLima(now, { timeZoneName: "longOffset" });
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00${get("timeZoneName").replace("GMT", "")}`);
}

export function nowInLima(): { fecha: string; hora: string } {
  const get = readInLima(new Date(), { hour: "2-digit", minute: "2-digit", hour12: false });
  return { fecha: `${get("year")}${get("month")}${get("day")}`, hora: `${get("hour")}:${get("minute")}` };
}
