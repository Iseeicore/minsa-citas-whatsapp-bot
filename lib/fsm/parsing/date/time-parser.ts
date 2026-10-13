import { MeridiemPeriod } from "@/lib/enums/meridiem-period";
import { ALL_WHITESPACE_RUNS, CLOCK_TIME } from "@/lib/constants/regex/text";
import {
  AFTERNOON_OR_NIGHT_WORD,
  BARE_HOUR,
  COMPACT_HOUR_AND_MINUTE,
  DOTTED_MERIDIEM,
  EARLIEST_TIME_REQUEST,
  HOUR_COLON_MINUTE,
  HOUR_MARKER,
  HOUR_MINUS_MINUTES,
  HOUR_ON_THE_DOT,
  HOUR_PLUS_MINUTES,
  LATEST_TIME_REQUEST,
  MIDNIGHT,
  MORNING_WORD,
  NOON,
  SYMBOLS_OUTSIDE_TIME_TEXT,
} from "@/lib/constants/regex/date-time";
import { MatchKind } from "@/lib/enums/match-kind";
import { TimeRequestKind } from "@/lib/enums/time-request-kind";
import { isString } from "@/lib/utils/type-guards";
import { stripAccents } from "@/lib/utils/text-values";
import { HIGHEST_AMBIGUOUS_BARE_HOUR } from "@/lib/constants/limits/date-time";

export type HoraSlot = { start: string; end: string; cupos: number };

export type HoraMatch =
  | { kind: MatchKind.EXACT; slot: HoraSlot }
  | { kind: MatchKind.SEVERAL; slots: HoraSlot[] }
  | { kind: MatchKind.UNAVAILABLE }
  | { kind: MatchKind.UNPARSED };

export function packHoraSlots(slots: HoraSlot[]): string {
  return slots.map((slot) => `${slot.start}|${slot.end}|${slot.cupos}`).join(";");
}

export function unpackHoraSlots(raw: unknown): HoraSlot[] {
  if (!isString(raw) || !raw) return [];

  const slots: HoraSlot[] = [];
  for (const part of raw.split(";")) {
    const [start, end, cupos] = part.split("|");
    if (!CLOCK_TIME.test(start ?? "") || !CLOCK_TIME.test(end ?? "")) return [];
    slots.push({ start, end, cupos: Number(cupos) || 0 });
  }
  return slots;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticinco: 25,
  treinta: 30,
};

function normalize(raw: string): string {
  const text = stripAccents(raw.toLowerCase())
    .replace(DOTTED_MERIDIEM, " $1m ")
    .replace(SYMBOLS_OUTSIDE_TIME_TEXT, " ")
    .replace(ALL_WHITESPACE_RUNS, " ")
    .trim();

  return text
    .split(" ")
    .map((word) => (NUMBER_WORDS[word] !== undefined ? String(NUMBER_WORDS[word]) : word))
    .join(" ");
}

type Parsed =
  | { kind: TimeRequestKind.TIME; hour: number; minute: number | null; period: MeridiemPeriod | null }
  | { kind: TimeRequestKind.PERIOD; period: MeridiemPeriod }
  | { kind: TimeRequestKind.EARLIEST }
  | { kind: TimeRequestKind.LATEST }
  | { kind: TimeRequestKind.NONE };

function detectPeriod(text: string): MeridiemPeriod | null {
  if (MORNING_WORD.test(text)) return MeridiemPeriod.AM;
  if (AFTERNOON_OR_NIGHT_WORD.test(text)) return MeridiemPeriod.PM;
  return null;
}

function parse(text: string): Parsed {
  if (EARLIEST_TIME_REQUEST.test(text)) {
    return { kind: TimeRequestKind.EARLIEST };
  }
  if (LATEST_TIME_REQUEST.test(text)) return { kind: TimeRequestKind.LATEST };

  if (NOON.test(text)) return { kind: TimeRequestKind.TIME, hour: 12, minute: 0, period: null };
  if (MIDNIGHT.test(text)) return { kind: TimeRequestKind.TIME, hour: 0, minute: 0, period: null };

  const period = detectPeriod(text);

  let hour: number | undefined;
  let minute: number | null = null;
  let hasHourMarker = false;
  let match: RegExpExecArray | null;

  if ((match = HOUR_COLON_MINUTE.exec(text))) {
    hour = Number(match[1]);
    minute = Number(match[2]);
    hasHourMarker = true;
  } else if ((match = HOUR_MINUS_MINUTES.exec(text))) {
    const back = match[2] === "cuarto" ? 15 : Number(match[2]);
    if (back < 1 || back > 59) return { kind: TimeRequestKind.NONE };
    hour = (Number(match[1]) + 23) % 24;
    minute = 60 - back;
    hasHourMarker = true;
  } else if ((match = HOUR_PLUS_MINUTES.exec(text))) {
    hour = Number(match[1]);
    minute = match[2] === "media" ? 30 : match[2] === "cuarto" ? 15 : Number(match[2]);
    hasHourMarker = true;
  } else if ((match = HOUR_ON_THE_DOT.exec(text))) {
    hour = Number(match[1]);
    minute = 0;
    hasHourMarker = true;
  } else if ((match = COMPACT_HOUR_AND_MINUTE.exec(text))) {
    const digits = match[1].padStart(4, "0");
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
    hasHourMarker = true;
  } else if ((match = BARE_HOUR.exec(text))) {
    hour = Number(match[1]);
    hasHourMarker = HOUR_MARKER.test(text) || period !== null;
  }

  if (hour === undefined) return period ? { kind: TimeRequestKind.PERIOD, period } : { kind: TimeRequestKind.NONE };

  if (hour > 24 || (minute !== null && minute > 59)) return { kind: TimeRequestKind.NONE };
  if (minute === null && !hasHourMarker && hour <= HIGHEST_AMBIGUOUS_BARE_HOUR) return { kind: TimeRequestKind.NONE };

  return { kind: TimeRequestKind.TIME, hour: hour % 24, minute, period };
}

function hourCandidates(hour: number, period: MeridiemPeriod | null): number[] {
  let candidates: number[];
  if (hour === 0) candidates = [0];
  else if (hour < 12) candidates = [hour, hour + 12];
  else if (hour === 12) candidates = [12, 0];
  else candidates = [hour];

  if (period === MeridiemPeriod.AM) candidates = candidates.filter((value) => value < 12);
  if (period === MeridiemPeriod.PM) candidates = candidates.filter((value) => value >= 12);
  return candidates;
}

function startOf(slot: HoraSlot): { hour: number; minute: number } {
  const [hour, minute] = slot.start.split(":").map(Number);
  return { hour, minute };
}

function toMatch(slots: HoraSlot[]): HoraMatch {
  if (slots.length === 0) return { kind: MatchKind.UNAVAILABLE };
  if (slots.length === 1) return { kind: MatchKind.EXACT, slot: slots[0] };
  return { kind: MatchKind.SEVERAL, slots };
}

export function matchHoraText(text: string, offered: HoraSlot[]): HoraMatch {
  if (offered.length === 0) return { kind: MatchKind.UNPARSED };

  const parsed = parse(normalize(text));
  const chronological = [...offered].sort((a, b) => a.start.localeCompare(b.start));

  switch (parsed.kind) {
    case TimeRequestKind.NONE:
      return { kind: MatchKind.UNPARSED };

    case TimeRequestKind.EARLIEST:
      return { kind: MatchKind.EXACT, slot: chronological[0] };

    case TimeRequestKind.LATEST:
      return { kind: MatchKind.EXACT, slot: chronological[chronological.length - 1] };

    case TimeRequestKind.PERIOD:
      return toMatch(
        chronological.filter((slot) => (parsed.period === MeridiemPeriod.AM ? startOf(slot).hour < 12 : startOf(slot).hour >= 12)),
      );

    case TimeRequestKind.TIME: {
      const hours = hourCandidates(parsed.hour, parsed.period);
      return toMatch(
        chronological.filter((slot) => {
          const start = startOf(slot);
          return hours.includes(start.hour) && (parsed.minute === null || parsed.minute === start.minute);
        }),
      );
    }
  }
}
