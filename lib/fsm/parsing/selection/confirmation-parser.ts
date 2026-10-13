import { STRETCHED_CHARACTER, WORD_SEPARATORS } from "@/lib/constants/regex/text";
import { Confirmation } from "@/lib/enums/confirmation";
import { SUITS_ME, TAKING_IT, TAKING_THAT } from "@/lib/constants/regex/selection";
import { stripAccents } from "@/lib/utils/text-values";
import { LONGEST_CONFIRMATION_PHRASE_WORDS } from "@/lib/constants/limits/selection";

export type { Confirmation };

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

function toWords(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .replace(STRETCHED_CHARACTER, "$1")
    .replace(WORD_SEPARATORS, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && !COURTESY_WORDS.has(word));
}

export function isSlotAcceptance(text: string): boolean {
  const phrase = toWords(text).join(" ");
  return TAKING_THAT.test(phrase) || SUITS_ME.test(phrase) || TAKING_IT.test(phrase);
}

export function resolveConfirmation(text: string): Confirmation {
  const words = toWords(text);
  if (words.length === 0) return Confirmation.UNKNOWN;

  let sawYes = false;
  let sawNo = false;
  let index = 0;

  while (index < words.length) {
    let consumed = 0;

    for (let size = Math.min(LONGEST_CONFIRMATION_PHRASE_WORDS, words.length - index); size >= 1; size--) {
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

    if (consumed === 0) return Confirmation.UNKNOWN;
    index += consumed;
  }

  if (sawYes && sawNo) return Confirmation.UNKNOWN;
  return sawYes ? Confirmation.YES : Confirmation.NO;
}
