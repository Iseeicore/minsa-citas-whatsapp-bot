import type { OfferedRow } from "./selection-matchers";

// Deterministic reading of a typed date ("mañana", "el viernes", "22 de
// septiembre", "22/09", "lo más pronto") against the dates MINSA actually
// offered. Pure: "today" is injected. Anything it cannot read is reported as
// `unparsed` so the caller can try the generic matcher and, last, the AI.

export type DateParts = { year: number; month: number; day: number };

export type FechaMatch =
  | { kind: "match"; row: OfferedRow }
  | { kind: "ambiguous"; rows: OfferedRow[] }
  // A date was understood, but MINSA offers no quota that day.
  | { kind: "unavailable"; label: string }
  | { kind: "unparsed" };

// MINSA sends DD/MM/YYYY; the Sandbox's fake catalog uses YYYYMMDD.
export function parseOfferedDate(id: string): DateParts | undefined {
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(id);
  if (match) return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };

  match = /^(\d{4})(\d{2})(\d{2})$/.exec(id);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  return undefined;
}

const sortKey = (date: DateParts): number => date.year * 10000 + date.month * 100 + date.day;

function addDays(date: DateParts, days: number): DateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function weekdayOf(date: DateParts): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function formatDate(date: DateParts): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.day)}/${pad(date.month)}/${date.year}`;
}

// What the citizen reads instead of a raw "22/09/2026" or the fake catalog's
// "20260922". Never the year — MINSA only ever offers near dates, close enough
// that it would be redundant. `formatDateShort` is built to always fit a
// WhatsApp list row (24 chars): 3-letter weekday, day, 3-letter month.
const WEEKDAY_NAMES_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAY_NAMES_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH_NAMES_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTH_NAMES_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatDateLong(date: DateParts): string {
  return `${WEEKDAY_NAMES_LONG[weekdayOf(date)]} ${date.day} de ${MONTH_NAMES_LONG[date.month - 1]}`;
}

export function formatDateShort(date: DateParts): string {
  return `${WEEKDAY_NAMES_SHORT[weekdayOf(date)]} ${date.day} ${MONTH_NAMES_SHORT[date.month - 1]}`;
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A day/month with no year means its next occurrence.
function resolveYear(day: number, month: number, today: DateParts, explicitYear?: number): number {
  if (explicitYear !== undefined) return explicitYear < 100 ? 2000 + explicitYear : explicitYear;
  return sortKey({ year: today.year, month, day }) < sortKey(today) ? today.year + 1 : today.year;
}

type Dated = { row: OfferedRow; date: DateParts };

function pickByDate(dated: Dated[], target: DateParts): FechaMatch {
  const found = dated.find((entry) => sortKey(entry.date) === sortKey(target));
  return found ? { kind: "match", row: found.row } : { kind: "unavailable", label: formatDate(target) };
}

function fromRows(rows: OfferedRow[], label: string): FechaMatch {
  if (rows.length === 1) return { kind: "match", row: rows[0] };
  if (rows.length > 1) return { kind: "ambiguous", rows };
  return { kind: "unavailable", label };
}

const MONTH_NAMES = Object.keys(MONTHS).join("|");
const WEEKDAY_NAMES = Object.keys(WEEKDAYS).join("|");

export function matchFechaText(text: string, rows: OfferedRow[], today: DateParts): FechaMatch {
  const normalized = normalize(text);
  if (!normalized) return { kind: "unparsed" };

  const dated: Dated[] = rows.flatMap((row) => {
    const date = parseOfferedDate(row.id);
    return date ? [{ row, date }] : [];
  });
  if (dated.length === 0) return { kind: "unparsed" };

  // "lo más pronto", "cualquiera", "la primera disponible"
  if (/\b(?:lo|la) mas (?:pronto|antes|cercan[oa])\b|\bcualquiera\b|\bcuanto antes\b|\bprimera (?:disponible|fecha)\b/.test(normalized)) {
    const earliest = [...dated].sort((a, b) => sortKey(a.date) - sortKey(b.date))[0];
    return { kind: "match", row: earliest.row };
  }

  // "22/09", "22-09-2026"
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(normalized);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return { kind: "unparsed" };
    const year = resolveYear(day, month, today, numeric[3] ? Number(numeric[3]) : undefined);
    return pickByDate(dated, { year, month, day });
  }

  // "22 de septiembre"
  const named = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_NAMES})\\b`).exec(normalized);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2]];
    if (day < 1 || day > 31) return { kind: "unparsed" };
    return pickByDate(dated, { year: resolveYear(day, month, today), month, day });
  }

  // "hoy", "mañana", "pasado mañana"
  if (/\bpasado manana\b/.test(normalized)) return pickByDate(dated, addDays(today, 2));
  if (/\bmanana\b/.test(normalized)) return pickByDate(dated, addDays(today, 1));
  if (/\bhoy\b/.test(normalized)) return pickByDate(dated, today);

  // "el viernes": every offered date on that weekday from today on
  const weekday = new RegExp(`\\b(${WEEKDAY_NAMES})\\b`).exec(normalized);
  if (weekday) {
    const wanted = WEEKDAYS[weekday[1]];
    const matches = dated
      .filter((entry) => weekdayOf(entry.date) === wanted && sortKey(entry.date) >= sortKey(today))
      .map((entry) => entry.row);
    return fromRows(matches, `el ${weekday[1]}`);
  }

  // "el 25", "día 29" — only when some offered date really falls on that day;
  // otherwise "el 2" is just an ordinal for the generic matcher.
  const dayOfMonth = /\b(?:dia|el)\s+(\d{1,2})\b/.exec(normalized);
  if (dayOfMonth) {
    const day = Number(dayOfMonth[1]);
    const matches = dated.filter((entry) => entry.date.day === day).map((entry) => entry.row);
    if (matches.length > 0) return fromRows(matches, `el ${day}`);
  }

  return { kind: "unparsed" };
}
