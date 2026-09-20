// Deterministic (no AI) reading of a typed yes/no for any step that offers an
// interactive confirmation. A citizen often types "si por favor" instead of
// tapping the button; the answer must count exactly like the tap.
//
// The reply is only accepted when EVERY word of it is a known yes-word (or every
// word a known no-word), after courtesy words are set aside. Anything else —
// "si pero a las 3", "no se", "si no" — is UNKNOWN, so the caller asks again
// instead of booking on a misread.

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

// Politeness that carries no decision: "si por favor", "no, gracias".
const COURTESY_WORDS = new Set(["por", "favor", "porfa", "porfis", "porfavor", "gracias", "muchas", "pues", "nomas"]);

const LONGEST_PHRASE_WORDS = 3;

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1{2,}/g, "$1") // "siii", "daleee"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && !COURTESY_WORDS.has(word));
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
