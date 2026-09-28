export type Confirmation = "YES" | "NO" | "UNKNOWN";

const YES_PHRASES = new Set([
  "1",
  "si",
  "sip",
  "sii",
  "yes",
  "ok",
  "okey",
  "okay",
  "dale",
  "vale",
  "claro",
  "claro que si",
  "confirmo",
  "confirmar",
  "confirmado",
  "de acuerdo",
  "esta bien",
  "correcto",
  "perfecto",
  "listo",
  "adelante",
  "acepto",
  "supuesto",
]);

const NO_PHRASES = new Set([
  "2",
  "no",
  "nop",
  "nel",
  "salir",
  "cancelar",
  "cancela",
  "cancelo",
  "cambiar",
  "cambio",
  "negativo",
  "nada",
  "otro",
  "otra",
  "otro horario",
  "otra hora",
  "otro dia",
  "ver mas",
  "ver horarios",
  "ver mas horarios",
  "ver otros",
  "mejor no",
  "no quiero",
]);

const COURTESY_WORDS = new Set(["por", "favor", "porfa", "porfis", "porfavor", "gracias", "muchas", "pues", "nomas"]);

const LONGEST_PHRASE_WORDS = 3;

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && !COURTESY_WORDS.has(word));
}

const LEADING_YES = "(?:(?:si|ok|okey|dale|vale|claro|listo)\\s+)?";
const TAKING_THAT = new RegExp(
  `^${LEADING_YES}(?:(?:quiero|tomo|acepto|confirmo|me quedo con)\\s+)?(?:esa|ese)(?:\\s+(?:misma|mismo))?(?:\\s+(?:hora|horario|cita))?$`,
);
const SUITS_ME = new RegExp(`^${LEADING_YES}(?:(?:esa|ese)\\s+)?me\\s+(?:sirve|conviene)$`);
const TAKING_IT = new RegExp(`^${LEADING_YES}(?:la|lo)\\s+(?:tomo|quiero|acepto|confirmo)$`);

export function isSlotAcceptance(text: string): boolean {
  const phrase = toWords(text).join(" ");
  return TAKING_THAT.test(phrase) || SUITS_ME.test(phrase) || TAKING_IT.test(phrase);
}

export function resolveConfirmation(text: string): Confirmation {
  const words = toWords(text);
  if (words.length === 0) return "UNKNOWN";

  let sawYes = false;
  let sawNo = false;
  let index = 0;

  while (index < words.length) {
    let consumed = 0;

    for (let size = Math.min(LONGEST_PHRASE_WORDS, words.length - index); size >= 1; size--) {
      const phrase = words.slice(index, index + size).join(" ");
      if (YES_PHRASES.has(phrase)) {
        sawYes = true;
        consumed = size;
        break;
      }
      if (NO_PHRASES.has(phrase)) {
        sawNo = true;
        consumed = size;
        break;
      }
    }

    if (consumed === 0) return "UNKNOWN";
    index += consumed;
  }

  if (sawYes && sawNo) return "UNKNOWN";
  return sawYes ? "YES" : "NO";
}
