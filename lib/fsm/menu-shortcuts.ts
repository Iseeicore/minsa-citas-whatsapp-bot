import { normalizeText } from "./domain";

// Deterministic shortcuts for the main menu: they answer without any AI call
// and without storing the message as the citizen's "opening message".

function words(text: string): string[] {
  return normalizeText(text)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
}

const GREETING_WORDS = new Set([
  "HOLA",
  "HOLAS",
  "HOLI",
  "BUENAS",
  "BUENOS",
  "BUEN",
  "DIA",
  "DIAS",
  "TARDE",
  "TARDES",
  "NOCHE",
  "NOCHES",
  "SALUDOS",
  "HELLO",
  "HI",
]);

// A bare "hola" / "buenos días" needs no AI to be answered with the menu.
// ("1" / "2" are NOT greetings: they pick a menu option, see handlers.ts.)
export function isGreeting(text: string): boolean {
  const tokens = words(text);
  return tokens.length > 0 && tokens.every((token) => GREETING_WORDS.has(token));
}

const RECLAMO_KEY_WORDS = new Set(["RECLAMO", "RECLAMOS", "QUEJA", "QUEJAS", "RECLAMACIONES"]);

const RECLAMO_FILLER_WORDS = new Set([
  "QUIERO",
  "DESEO",
  "NECESITO",
  "HACER",
  "PONER",
  "REGISTRAR",
  "FORMULAR",
  "INTERPONER",
  "PRESENTAR",
  "UN",
  "UNA",
  "MI",
  "DE",
  "EL",
  "LIBRO",
  "PARA",
]);

// "RECLAMO", "quiero hacer un reclamo", "registrar una queja" ... — the
// institutional warning tells citizens to type RECLAMO, so it has to work.
export function isReclamoKeyword(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > 6) return false;

  return (
    tokens.some((token) => RECLAMO_KEY_WORDS.has(token)) &&
    tokens.every((token) => RECLAMO_KEY_WORDS.has(token) || RECLAMO_FILLER_WORDS.has(token))
  );
}
