import type { DateParts } from "@/lib/fsm/parsing/date-parser";

export function todayInLima(): DateParts {
  const fecha = nowInLima().fecha;
  return {
    year: Number(fecha.slice(0, 4)),
    month: Number(fecha.slice(4, 6)),
    day: Number(fecha.slice(6, 8)),
  };
}

/** Lee la hora de America/Lima con Intl (UTC-5, sin horario de verano): la zona horaria del servidor no es confiable. */
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
