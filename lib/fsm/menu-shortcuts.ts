import { extractCitaHints, type CitaHints } from "./cita-hints";
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

// ---- Explicit cita request -------------------------------------------------
// "Quiero una cita en San Juan de Lurigancho para atenderme en medicina
// general" already says everything the Cita flow asks for. Reading it here
// costs no AI call and cannot fail the way one can. Deliberately conservative:
// it needs a cita word AND at least one thing extractCitaHints recognizes, and
// anything that sounds like an existing appointment or a complaint is left to
// the AI (or the menu).

const CITA_INTENT_WORDS = new Set([
  "CITA",
  "CITAS",
  "AGENDAR",
  "AGENDARME",
  "RESERVAR",
  "TURNO",
  "ATENDERME",
  "ATENCION",
]);

const NOT_A_NEW_CITA_WORDS = new Set([
  "CANCELAR",
  "ANULAR",
  "REPROGRAMAR",
  "CAMBIAR",
  "MODIFICAR",
  "RECLAMO",
  "RECLAMOS",
  "QUEJA",
  "QUEJAS",
]);

export function detectCitaRequest(text: string): CitaHints | undefined {
  const tokens = words(text);
  if (!tokens.some((token) => CITA_INTENT_WORDS.has(token))) return undefined;
  if (tokens.some((token) => NOT_A_NEW_CITA_WORDS.has(token))) return undefined;
  if (tokens.some((token, index) => token === "MI" && tokens[index + 1] === "CITA")) return undefined;

  const hints = extractCitaHints(text);
  return hints.especialidad || hints.distrito ? hints : undefined;
}

// ---- "Continuar" after the institutional warning ---------------------------
// After a warning the only thing waiting is the "Continuar" button, which just
// shows the menu again. A short message that clearly means "go on" does the
// same — without an AI call and without tapping anything.

const CONTINUE_WORDS = new Set([
  "CONTINUAR",
  "CONTINUEMOS",
  "CONTINUA",
  "CONTINUO",
  "SEGUIR",
  "SEGUIMOS",
  "SIGAMOS",
  "SIGUE",
  "SIGO",
  "VAMOS",
  "VAMO",
  "DALE",
  "ADELANTE",
  "AVANZA",
  "AVANCEMOS",
  "LISTO",
  "OK",
  "OKEY",
  "SI",
  "YA",
]);

const STOP_WORDS = new Set(["NO", "NUNCA", "CANCELAR", "CANCELO"]);
const MAX_CONTINUE_WORDS = 5;

export function isContinueReply(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > MAX_CONTINUE_WORDS) return false;
  if (tokens.some((token) => STOP_WORDS.has(token))) return false;
  return tokens.some((token) => CONTINUE_WORDS.has(token));
}

const RECLAMO_KEY_WORDS =new Set(["RECLAMO", "RECLAMOS", "QUEJA", "QUEJAS", "RECLAMACIONES"]);

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
