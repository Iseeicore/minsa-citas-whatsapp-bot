import {
  CITA_TOKEN_PATTERNS,
  COMPLAINT_PHRASE_PATTERNS,
  COMPLAINT_TOKEN_PATTERNS,
  FUZZY_TARGETS,
  HEALTH_TOKEN_PATTERNS,
  INSULT_PHRASE_PATTERNS,
  INSULT_TOKEN_PATTERNS,
  PROTECTED_PHRASES,
  PROTECTED_WORDS,
} from "./lexicon";
import { PLACE_NAME_WORDS } from "./place-names";

// Deterministic, in-memory pre-filter run before the FSM and before any AI
// call. Pure function: no I/O, no shared state.

export type LexicalAction = "ALLOW" | "DROP_AND_WARN" | "CITA_WITH_WARNING" | "FORCE_RECLAMO";

export type LexicalResult = {
  action: LexicalAction;
  isOffensive: boolean;
  hasCitaContext: boolean;
  hasComplaintContext: boolean;
  matchedReason?: string;
};

export const RESPECT_REMINDER_TEXT =
  "Le recordamos que este es un canal institucional oficial del MINSA y mantenemos una política de respeto.";

// Only shown where typing RECLAMO actually starts the complaint flow (the
// main menu) — mid-flow states have no such shortcut.
export const INSTITUTIONAL_WARNING_TEXT = `${RESPECT_REMINDER_TEXT} Si desea registrar una queja o denuncia formal sobre un mal servicio de salud, escriba RECLAMO para iniciar el trámite oficial.`;

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
};

const HAS_LETTER = /[a-z]/;
const HAS_LEET_CHAR = /[01345789@$!]/;
const NON_TOKEN_CHARS = /[^a-z0-9@$!]+/;

// A run of this many single-character tokens ("i . d . i . o . t . a",
// "c s m") is joined back into one word. Only such runs are joined — never the
// whole sentence — so unrelated neighbouring words cannot form a root.
const MIN_SPACED_RUN = 3;

const MIN_FUZZY_TOKEN_LENGTH = 5;

function stripAccents(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function toPieces(normalized: string): string[] {
  const pieces: string[] = [];
  for (const chunk of normalized.split(/\s+/)) {
    for (const piece of chunk.split(NON_TOKEN_CHARS)) {
      // Leading/trailing "!" is punctuation ("hdp!!!"); an inner one is a
      // disguised "i" ("1mb3c!l") and is kept for the leet step.
      const cleaned = piece.replace(/^!+|!+$/g, "");
      if (cleaned) pieces.push(cleaned);
    }
  }
  return pieces;
}

function joinSpacedRuns(pieces: string[]): string[] {
  const result: string[] = [];
  let run: string[] = [];

  const flushRun = () => {
    if (run.length >= MIN_SPACED_RUN) result.push(run.join(""));
    else result.push(...run);
    run = [];
  };

  for (const piece of pieces) {
    if (piece.length === 1) {
      run.push(piece);
    } else {
      flushRun();
      result.push(piece);
    }
  }
  flushRun();

  return result;
}

function finalizeToken(piece: string): string {
  let token = piece;

  // Leetspeak only inside tokens that mix letters with substitutable
  // characters — a pure number (DNI, phone) is never turned into letters.
  if (HAS_LETTER.test(token) && HAS_LEET_CHAR.test(token)) {
    token = token.replace(/[01345789@$!]/g, (char) => LEET_MAP[char] ?? char);
  }

  token = token.replace(/[^a-z0-9]/g, "");

  // "cojuuuudo" -> "cojudo": 3+ repeats collapse to one letter.
  if (HAS_LETTER.test(token)) token = token.replace(/(.)\1{2,}/g, "$1");

  return token;
}

function removeProtectedPhrases(tokens: string[]): string[] {
  let joined = tokens.join(" ");
  for (const phrase of PROTECTED_PHRASES) {
    joined = joined.replace(new RegExp(`\\b${phrase}\\b`, "g"), " ");
  }
  return joined.split(" ").filter(Boolean);
}

// Canonical initials — each capital followed by a period, separated by spaces,
// as in "Atentamente C. S. M." or "Dra. Rosario P. T. M." — are a signature or
// a name, not the abbreviation "csm"/"ptm". Removed BEFORE the letter runs are
// joined. The spaced/dotted evasions people actually type ("c s m", "c.s.m",
// "C S M", "C-S-M") do not have this shape and are still joined and caught.
// Accepted trade-off: an abuser who types canonical initials slips through.
const CANONICAL_INITIALS = /(?<![\p{L}\p{N}])(?:\p{Lu}\.\s+){2,}\p{Lu}\.?(?![\p{L}\p{N}])/gu;

function tokenize(text: string): string[] {
  const pieces = joinSpacedRuns(toPieces(stripAccents(text.replace(CANONICAL_INITIALS, " "))));
  const tokens = pieces.map(finalizeToken).filter(Boolean);
  return removeProtectedPhrases(tokens);
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    previous = current;
  }

  return previous[b.length];
}

// 1 edit for 5-letter tokens, 2 for 6+ — by the TOKEN's length, so short
// everyday words stay strict.
function fuzzyTolerance(token: string): number {
  return token.length <= 5 ? 1 : 2;
}

function findFuzzyInsult(token: string): { target: string; distance: number } | undefined {
  if (token.length < MIN_FUZZY_TOKEN_LENGTH) return undefined;
  if (PROTECTED_WORDS.has(token) || PLACE_NAME_WORDS.has(token)) return undefined;

  const tolerance = fuzzyTolerance(token);

  for (const target of FUZZY_TARGETS) {
    if (token[0] !== target[0]) continue;
    if (Math.abs(token.length - target.length) > tolerance) continue;

    const distance = levenshtein(token, target);
    if (distance <= tolerance) return { target, distance };
  }

  return undefined;
}

function findInsult(tokens: string[]): string | undefined {
  for (const token of tokens) {
    if (INSULT_TOKEN_PATTERNS.some((pattern) => pattern.test(token))) {
      return `Coincidencia exacta de término: "${token}"`;
    }
  }

  const joined = tokens.join(" ");
  for (const pattern of INSULT_PHRASE_PATTERNS) {
    const match = pattern.exec(joined);
    if (match) return `Coincidencia de frase: "${match[0]}"`;
  }

  for (const token of tokens) {
    const fuzzy = findFuzzyInsult(token);
    if (fuzzy) {
      return `Coincidencia difusa: "${token}" similar a "${fuzzy.target}" (distancia ${fuzzy.distance})`;
    }
  }

  return undefined;
}

function anyTokenMatches(tokens: string[], patterns: RegExp[]): boolean {
  return tokens.some((token) => patterns.some((pattern) => pattern.test(token)));
}

export function evaluateLexicalGuard(message: string): LexicalResult {
  const tokens = tokenize(message);
  const matchedReason = findInsult(tokens);
  const isOffensive = matchedReason !== undefined;

  const joined = tokens.join(" ");
  const hasCitaContext = anyTokenMatches(tokens, CITA_TOKEN_PATTERNS);
  const hasHealthContext = anyTokenMatches(tokens, HEALTH_TOKEN_PATTERNS);
  const hasComplaintContext =
    anyTokenMatches(tokens, COMPLAINT_TOKEN_PATTERNS) ||
    COMPLAINT_PHRASE_PATTERNS.some((pattern) => pattern.test(joined));

  const base = { isOffensive, hasCitaContext, hasComplaintContext, matchedReason };

  if (!isOffensive) return { ...base, action: "ALLOW" };

  // An explicit complaint always wins; a bare health word next to an insult
  // is an angry complaint about the service unless they also asked for a cita.
  if (hasComplaintContext || (hasHealthContext && !hasCitaContext)) {
    return { ...base, action: "FORCE_RECLAMO" };
  }

  if (hasCitaContext) return { ...base, action: "CITA_WITH_WARNING" };

  return { ...base, action: "DROP_AND_WARN" };
}
