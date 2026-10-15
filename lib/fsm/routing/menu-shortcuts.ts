import { SYMBOLS_IN_UPPERCASE_TEXT } from "@/lib/constants/regex/text";
import { extractCitaHints, type CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import {
  CITA_KEYWORD,
  MI_KEYWORD,
  GREETING_WORDS,
  CITA_INTENT_WORDS,
  NOT_A_NEW_CITA_WORDS,
  CONTINUE_WORDS,
  STOP_WORDS,
  INCIDENCIA_KEY_WORDS,
  INCIDENCIA_FILLER_WORDS,
  REFERENCIA_KEY_WORDS,
  REFERENCIA_FILLER_WORDS,
} from "@/lib/constants/palabras-clave";
import { MAX_CONTINUE_WORDS, MAX_INCIDENCIA_KEYWORD_WORDS, MAX_REFERENCIA_KEYWORD_WORDS } from "@/lib/constants/limits/menu";

function words(text: string): string[] {
  return normalizeText(text).replace(SYMBOLS_IN_UPPERCASE_TEXT, " ").split(" ").filter(Boolean);
}

export function isGreeting(text: string): boolean {
  const tokens = words(text);
  return tokens.length > 0 && tokens.every((token) => GREETING_WORDS.has(token));
}

export function detectCitaRequest(text: string): CitaHints | undefined {
  const tokens = words(text);
  if (!tokens.some((token) => CITA_INTENT_WORDS.has(token))) return undefined;
  if (tokens.some((token) => NOT_A_NEW_CITA_WORDS.has(token))) return undefined;
  if (tokens.some((token, index) => token === MI_KEYWORD && tokens[index + 1] === CITA_KEYWORD)) return undefined;

  return extractCitaHints(text);
}

export function isContinueReply(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > MAX_CONTINUE_WORDS) return false;
  if (tokens.some((token) => STOP_WORDS.has(token))) return false;
  return tokens.some((token) => CONTINUE_WORDS.has(token));
}

export function isIncidenciaKeyword(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > MAX_INCIDENCIA_KEYWORD_WORDS) return false;

  return (
    tokens.some((token) => INCIDENCIA_KEY_WORDS.has(token)) &&
    tokens.every((token) => INCIDENCIA_KEY_WORDS.has(token) || INCIDENCIA_FILLER_WORDS.has(token))
  );
}

export function isReferenciaKeyword(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > MAX_REFERENCIA_KEYWORD_WORDS) return false;

  return (
    tokens.some((token) => REFERENCIA_KEY_WORDS.has(token)) &&
    tokens.every((token) => REFERENCIA_KEY_WORDS.has(token) || REFERENCIA_FILLER_WORDS.has(token))
  );
}
