import type { Session } from "@/lib/fsm/core/types";

export type OfferedRow = { id: string; title: string; description?: string };
export type OfferedList = { text: string; rows: OfferedRow[] };

export const OFFERED_SLOT = "citaOffered";

export function serializeOffered(list: OfferedList): string {
  return JSON.stringify(list);
}

function isOfferedRow(value: unknown): value is OfferedRow {
  const row = value as Partial<OfferedRow> | null;
  return (
    typeof row?.id === "string" &&
    typeof row?.title === "string" &&
    (row.description === undefined || typeof row.description === "string")
  );
}

export function readOffered(slots: Session["slots"]): OfferedList | undefined {
  const raw = slots[OFFERED_SLOT];
  if (typeof raw !== "string") return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<OfferedList> | null;
    if (typeof parsed?.text !== "string" || !Array.isArray(parsed.rows)) return undefined;
    if (!parsed.rows.every(isOfferedRow)) return undefined;
    return { text: parsed.text, rows: parsed.rows };
  } catch {
    return undefined;
  }
}

export type SelectionMatch =
  | { kind: "match"; row: OfferedRow }
  | { kind: "ambiguous"; rows: OfferedRow[] }
  | { kind: "none" };

export type MatchOptions = {
  includeDescription?: boolean;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ORDINAL_WORDS: Record<string, number> = {
  uno: 1, primero: 1, primera: 1,
  dos: 2, segundo: 2, segunda: 2,
  tres: 3, tercero: 3, tercera: 3,
  cuatro: 4, cuarto: 4, cuarta: 4,
  cinco: 5, quinto: 5, quinta: 5,
  seis: 6, sexto: 6, sexta: 6,
  siete: 7, septimo: 7, septima: 7,
  ocho: 8, octavo: 8, octava: 8,
  nueve: 9, noveno: 9, novena: 9,
  diez: 10, decimo: 10, decima: 10,
};

const ORDINAL_FILLER =
  /^(?:(?:quiero|quisiera|elijo|escojo|prefiero|selecciono|me quedo con|la|el|lo|opcion|numero|nro|num)\s+)+/;

function parseOrdinal(normalized: string, count: number): number | undefined {
  const rest = normalized.replace(ORDINAL_FILLER, "");

  let position: number | undefined;
  if (/^\d{1,2}$/.test(rest)) position = Number(rest);
  else if (rest === "ultimo" || rest === "ultima") position = count;
  else position = ORDINAL_WORDS[rest];

  return position !== undefined && position >= 1 && position <= count ? position : undefined;
}

const STOP_WORDS = new Set([
  "el", "la", "los", "las", "de", "del", "en", "un", "una", "unos", "unas", "y", "a", "al", "lo",
  "que", "quiero", "quisiera", "necesito", "por", "favor", "para", "con", "mi", "me", "es", "ese",
  "esa", "eso", "opcion", "numero",
]);

type HayToken = { word: string; truncated: boolean };

function rowTokens(row: OfferedRow, includeDescription: boolean): HayToken[] {
  const titleWords = normalize(row.title).split(" ").filter(Boolean);
  const titleTruncated = row.title.endsWith("…");

  const tokens: HayToken[] = titleWords.map((word, index) => ({
    word,
    truncated: titleTruncated && index === titleWords.length - 1,
  }));

  if (includeDescription && row.description) {
    for (const word of normalize(row.description).split(" ").filter(Boolean)) {
      tokens.push({ word, truncated: false });
    }
  }

  return tokens;
}

function tokenMatches(typed: string, hay: HayToken): boolean {
  if (typed === hay.word) return true;
  if (typed.length >= 4 && hay.word.startsWith(typed)) return true;
  return hay.truncated && hay.word.length >= 4 && typed.startsWith(hay.word);
}

export function matchSelection(
  text: string,
  rows: OfferedRow[],
  options: MatchOptions = {},
): SelectionMatch {
  const normalized = normalize(text);
  if (!normalized || rows.length === 0) return { kind: "none" };

  const position = parseOrdinal(normalized, rows.length);
  if (position !== undefined) return { kind: "match", row: rows[position - 1] };

  const typedTokens = normalized.split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  if (typedTokens.length === 0) return { kind: "none" };

  const scored = rows.map((row) => {
    const hay = rowTokens(row, options.includeDescription ?? false);
    const score = typedTokens.filter((typed) => hay.some((token) => tokenMatches(typed, token))).length;
    return { row, score };
  });

  const best = Math.max(...scored.map((entry) => entry.score));
  if (best === 0) return { kind: "none" };

  const winners = scored.filter((entry) => entry.score === best).map((entry) => entry.row);
  return winners.length === 1 ? { kind: "match", row: winners[0] } : { kind: "ambiguous", rows: winners };
}

const HINT_NOISE_WORDS = new Set([
  "cita", "citas", "atencion", "agendar", "consulta", "medico", "medica", "doctor", "doctora",
  "reservar", "turno",
]);

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token) && !HINT_NOISE_WORDS.has(token));
}

export function leftoverHint(text: string, chosen: OfferedRow): string {
  const chosenTokens = rowTokens(chosen, false);
  return significantTokens(text)
    .filter((token) => !chosenTokens.some((hay) => tokenMatches(token, hay)))
    .join(" ");
}

export function hintText(text: string): string {
  return significantTokens(text).join(" ");
}

export function matchAllTokens(
  hint: string,
  rows: OfferedRow[],
  options: MatchOptions = {},
): OfferedRow | undefined {
  const tokens = significantTokens(hint);
  if (tokens.length === 0) return undefined;

  const winners = rows.filter((row) => {
    const hay = rowTokens(row, options.includeDescription ?? false);
    return tokens.every((token) => hay.some((entry) => tokenMatches(token, entry)));
  });

  return winners.length === 1 ? winners[0] : undefined;
}
