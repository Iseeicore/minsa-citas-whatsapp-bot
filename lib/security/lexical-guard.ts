import { FUZZY_TARGETS, PROTECTED_WORDS } from "@/lib/security/lexicon";
import { PLACE_NAME_WORDS } from "@/lib/security/place-names";
import { STRETCHED_CHARACTER, WHITESPACE_RUN } from "@/lib/constants/regex/text";
import {
  CANONICAL_INITIALS,
  CITA_TOKEN_PATTERNS,
  COMPLAINT_PHRASE_PATTERNS,
  COMPLAINT_TOKEN_PATTERNS,
  DOUBLED_CONSONANT,
  EDGE_EXCLAMATION_MARKS,
  EVERY_LEET_CHAR,
  HAS_LEET_CHAR,
  HAS_LETTER,
  HEALTH_TOKEN_PATTERNS,
  INSULT_PHRASE_PATTERNS,
  INSULT_TOKEN_PATTERNS,
  NON_TOKEN_CHARS,
  PROTECTED_PHRASE_PATTERNS,
  SEPARATED_WORD,
  SYMBOL_LEFT_IN_TOKEN,
} from "@/lib/constants/regex/security";
import { stripAccents } from "@/lib/utils/text-values";

export type LexicalAction = "ALLOW" | "DROP_AND_WARN" | "CITA_WITH_WARNING" | "FORCE_INCIDENCIA";

export type LexicalResult = {
  action: LexicalAction;
  isOffensive: boolean;
  hasCitaContext: boolean;
  hasComplaintContext: boolean;
  matchedReason?: string;
};

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

const MIN_SPACED_RUN = 3;

const MIN_FUZZY_TOKEN_LENGTH = 5;

const MAX_JOINED_LENGTH = 40;

function toPieces(normalized: string): string[] {
  const pieces: string[] = [];
  for (const chunk of normalized.split(WHITESPACE_RUN)) {
    const chunkPieces: string[] = [];
    for (const piece of chunk.split(NON_TOKEN_CHARS)) {
      const cleaned = piece.replace(EDGE_EXCLAMATION_MARKS, "");
      if (cleaned) chunkPieces.push(cleaned);
    }
    pieces.push(...chunkPieces);

    if (chunkPieces.length > 1 && SEPARATED_WORD.test(chunk)) {
      const joined = chunkPieces.join("");
      if (joined.length <= MAX_JOINED_LENGTH) pieces.push(joined);
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

  if (HAS_LETTER.test(token) && HAS_LEET_CHAR.test(token)) {
    token = token.replace(EVERY_LEET_CHAR, (char) => LEET_MAP[char] ?? char);
  }

  token = token.replace(SYMBOL_LEFT_IN_TOKEN, "");

  if (HAS_LETTER.test(token)) token = token.replace(STRETCHED_CHARACTER, "$1");

  return token;
}

function removeProtectedPhrases(tokens: string[]): string[] {
  let joined = tokens.join(" ");
  for (const protectedPhrase of PROTECTED_PHRASE_PATTERNS) {
    joined = joined.replace(protectedPhrase, " ");
  }
  return joined.split(" ").filter(Boolean);
}

function tokenize(text: string): string[] {
  const pieces = joinSpacedRuns(toPieces(stripAccents(text.replace(CANONICAL_INITIALS, " ").toLowerCase())));
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

function collapseDoubledConsonants(token: string): string {
  return token.replace(DOUBLED_CONSONANT, "$1");
}

function matchesInsultPattern(token: string): boolean {
  return INSULT_TOKEN_PATTERNS.some((pattern) => pattern.test(token));
}

function findInsult(tokens: string[]): string | undefined {
  for (const token of tokens) {
    if (matchesInsultPattern(token)) {
      return `Coincidencia exacta de término: "${token}"`;
    }

    const collapsed = collapseDoubledConsonants(token);
    if (collapsed !== token && matchesInsultPattern(collapsed)) {
      return `Coincidencia de término con consonante repetida: "${token}" ~ "${collapsed}"`;
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

  if (hasComplaintContext || (hasHealthContext && !hasCitaContext)) {
    return { ...base, action: "FORCE_INCIDENCIA" };
  }

  if (hasCitaContext) return { ...base, action: "CITA_WITH_WARNING" };

  return { ...base, action: "DROP_AND_WARN" };
}
