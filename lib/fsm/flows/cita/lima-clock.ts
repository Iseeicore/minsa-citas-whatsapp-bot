import type { DateParts } from "@/lib/fsm/parsing/date-parser";

export function todayInLima(): DateParts {
  const fecha = nowInLima().fecha; // YYYYMMDD
  return {
    year: Number(fecha.slice(0, 4)),
    month: Number(fecha.slice(4, 6)),
    day: Number(fecha.slice(6, 8)),
  };
}

// Peru runs on America/Lima year-round (UTC-5, no DST) — the serverless
// runtime's own local time zone can't be relied on, so this reads Lima's
// wall-clock date/time explicitly via Intl instead of `new Date()`'s
// local getters.
export function nowInLima(): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { fecha: `${get("year")}${get("month")}${get("day")}`, hora: `${get("hour")}:${get("minute")}` };
}
