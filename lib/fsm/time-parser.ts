// Deterministic reading of a typed time ("a la 1", "1:45 pm", "9 y media",
// "en la tarde", "lo más temprano") against the slots MINSA offered for the
// chosen day. MINSA speaks 24h ("13:00"); citizens speak 12h. The typed text
// is only ever used to CHOOSE among offered slots — what gets booked is always
// the offered slot's own 24h start, never anything derived from the text.

export type HoraSlot = { start: string; end: string; cupos: number };

export type HoraMatch =
  | { kind: "exact"; slot: HoraSlot }
  | { kind: "several"; slots: HoraSlot[] }
  // A time was understood, but nothing offered fits it.
  | { kind: "unavailable" }
  | { kind: "unparsed" };

// ---- Compact scalar slot for the whole day's offer ---------------------------
// Session.slots only holds scalars: "08:00|08:30|2;08:45|09:15|1;..." (~2 KB for
// a full day of 5-minute slots).

export function packHoraSlots(slots: HoraSlot[]): string {
  return slots.map((slot) => `${slot.start}|${slot.end}|${slot.cupos}`).join(";");
}

export function unpackHoraSlots(raw: unknown): HoraSlot[] {
  if (typeof raw !== "string" || !raw) return [];

  const slots: HoraSlot[] = [];
  for (const part of raw.split(";")) {
    const [start, end, cupos] = part.split("|");
    // Skip just THIS entry, not the whole day: MINSA's real hora_inicio/
    // hora_fin (lib/fsm/minsa.ts) is taken as-is with no zero-padding, so
    // one unpadded early hour ("9:30" instead of "09:30") must not blank
    // out matching for every other, well-formed hour offered that day.
    if (!/^\d{2}:\d{2}$/.test(start ?? "") || !/^\d{2}:\d{2}$/.test(end ?? "")) continue;
    slots.push({ start, end, cupos: Number(cupos) || 0 });
  }
  return slots;
}

// ---- Text normalization ------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintidos: 22, veintitres: 23, veinticinco: 25, treinta: 30,
};

function normalize(raw: string): string {
  const text = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b([ap])\.\s?m\.?/g, " $1m ")
    .replace(/[^a-z0-9: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = text.split(" ");
  return words
    .map((word, index) => {
      // "un"/"una" is Spanish's indefinite article AND its word for "one" —
      // "quiero UNA cita a las 5" ("an appointment") is not "quiero 1 cita a
      // las 5". Only read it as the hour when it's actually said as one
      // ("la una", "a la una"), i.e. right after "la"/"las" — otherwise the
      // FIRST bare number the parser below finds would be this false "1",
      // hiding whatever hour the citizen actually typed later in the
      // sentence. Every other number word (dos, tres...) has no such
      // article role in Spanish, so they keep converting unconditionally.
      if ((word === "un" || word === "una") && words[index - 1] !== "la" && words[index - 1] !== "las") {
        return word;
      }
      return NUMBER_WORDS[word] !== undefined ? String(NUMBER_WORDS[word]) : word;
    })
    .join(" ");
}

// ---- Parsing -----------------------------------------------------------------

type Period = "AM" | "PM";

type Parsed =
  | { kind: "time"; hour: number; minute: number | null; period: Period | null }
  | { kind: "period"; period: Period }
  | { kind: "earliest" }
  | { kind: "latest" }
  | { kind: "none" };

function detectPeriod(text: string): Period | null {
  if (/\b(?:am|manana|madrugada)\b/.test(text)) return "AM";
  if (/\b(?:pm|tarde|noche)\b/.test(text)) return "PM";
  return null;
}

function parse(text: string): Parsed {
  if (/\blo mas (?:pronto|temprano)\b|\bcuanto antes\b|\bla mas temprano\b/.test(text)) {
    return { kind: "earliest" };
  }
  if (/\b(?:lo|la) mas tarde\b/.test(text)) return { kind: "latest" };

  if (/\bmediodia\b/.test(text)) return { kind: "time", hour: 12, minute: 0, period: null };
  if (/\bmedianoche\b/.test(text)) return { kind: "time", hour: 0, minute: 0, period: null };

  const period = detectPeriod(text);

  let hour: number | undefined;
  let minute: number | null = null;
  let hasHourMarker = false;
  let match: RegExpExecArray | null;

  if ((match = /\b(\d{1,2}):(\d{2})\b/.exec(text))) {
    hour = Number(match[1]);
    minute = Number(match[2]);
    hasHourMarker = true;
  } else if ((match = /\b(\d{1,2}) menos (cuarto|\d{1,2})\b/.exec(text))) {
    const back = match[2] === "cuarto" ? 15 : Number(match[2]);
    if (back < 1 || back > 59) return { kind: "none" };
    hour = (Number(match[1]) + 23) % 24;
    minute = 60 - back;
    hasHourMarker = true;
  } else if ((match = /\b(\d{1,2}) (?:y|con) (media|cuarto|\d{1,2})\b/.exec(text))) {
    hour = Number(match[1]);
    minute = match[2] === "media" ? 30 : match[2] === "cuarto" ? 15 : Number(match[2]);
    hasHourMarker = true;
  } else if ((match = /\b(\d{1,2}) en punto\b/.exec(text))) {
    hour = Number(match[1]);
    minute = 0;
    hasHourMarker = true;
  } else if ((match = /\b(\d{3,4})\b/.exec(text))) {
    const digits = match[1].padStart(4, "0");
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2));
    hasHourMarker = true;
  } else if ((match = /\b(\d{1,2})\b/.exec(text))) {
    hour = Number(match[1]);
    // "a la 1", "las 7", "1 pm", "7 de la noche": an hour. A bare "1".."10"
    // is a list position, which the generic matcher reads.
    hasHourMarker = /\ba las?\b|\blas \d|\bhoras?\b|\bhrs?\b/.test(text) || period !== null;
  }

  if (hour === undefined) return period ? { kind: "period", period } : { kind: "none" };

  if (hour > 24 || (minute !== null && minute > 59)) return { kind: "none" };
  if (minute === null && !hasHourMarker && hour <= 10) return { kind: "none" };

  return { kind: "time", hour: hour % 24, minute, period };
}

// MINSA speaks 24h; a citizen's "1" may be 01:00 or 13:00. Every possibility
// is kept and intersected with what is actually offered.
function hourCandidates(hour: number, period: Period | null): number[] {
  let candidates: number[];
  if (hour === 0) candidates = [0];
  else if (hour < 12) candidates = [hour, hour + 12];
  else if (hour === 12) candidates = [12, 0];
  else candidates = [hour];

  if (period === "AM") candidates = candidates.filter((value) => value < 12);
  if (period === "PM") candidates = candidates.filter((value) => value >= 12);
  return candidates;
}

function startOf(slot: HoraSlot): { hour: number; minute: number } {
  const [hour, minute] = slot.start.split(":").map(Number);
  return { hour, minute };
}

function toMatch(slots: HoraSlot[]): HoraMatch {
  if (slots.length === 0) return { kind: "unavailable" };
  if (slots.length === 1) return { kind: "exact", slot: slots[0] };
  return { kind: "several", slots };
}

export function matchHoraText(text: string, offered: HoraSlot[]): HoraMatch {
  if (offered.length === 0) return { kind: "unparsed" };

  const parsed = parse(normalize(text));
  const chronological = [...offered].sort((a, b) => a.start.localeCompare(b.start));

  switch (parsed.kind) {
    case "none":
      return { kind: "unparsed" };

    case "earliest":
      return { kind: "exact", slot: chronological[0] };

    case "latest":
      return { kind: "exact", slot: chronological[chronological.length - 1] };

    case "period":
      return toMatch(
        chronological.filter((slot) =>
          parsed.period === "AM" ? startOf(slot).hour < 12 : startOf(slot).hour >= 12,
        ),
      );

    case "time": {
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
