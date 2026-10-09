import { extractCitaHints, type CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { normalizeText } from "@/lib/fsm/parsing/text/text";

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

export function isGreeting(text: string): boolean {
  const tokens = words(text);
  return tokens.length > 0 && tokens.every((token) => GREETING_WORDS.has(token));
}

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
  "INCIDENCIA",
  "INCIDENCIAS",
  "RECLAMO",
  "RECLAMOS",
  "QUEJA",
  "QUEJAS",
  "DENUNCIA",
  "DENUNCIAS",
]);

export function detectCitaRequest(text: string): CitaHints | undefined {
  const tokens = words(text);
  if (!tokens.some((token) => CITA_INTENT_WORDS.has(token))) return undefined;
  if (tokens.some((token) => NOT_A_NEW_CITA_WORDS.has(token))) return undefined;
  if (tokens.some((token, index) => token === "MI" && tokens[index + 1] === "CITA")) return undefined;

  return extractCitaHints(text);
}

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

const INCIDENCIA_KEY_WORDS = new Set([
  "INCIDENCIA",
  "INCIDENCIAS",
  "RECLAMO",
  "RECLAMOS",
  "QUEJA",
  "QUEJAS",
  "DENUNCIA",
  "DENUNCIAS",
  "RECLAMACIONES",
]);

const INCIDENCIA_FILLER_WORDS = new Set([
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

export function isIncidenciaKeyword(text: string): boolean {
  const tokens = words(text);
  if (tokens.length === 0 || tokens.length > 6) return false;

  return (
    tokens.some((token) => INCIDENCIA_KEY_WORDS.has(token)) &&
    tokens.every((token) => INCIDENCIA_KEY_WORDS.has(token) || INCIDENCIA_FILLER_WORDS.has(token))
  );
}
