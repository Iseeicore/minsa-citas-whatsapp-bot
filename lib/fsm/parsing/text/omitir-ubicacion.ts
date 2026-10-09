const OMIT_PHRASES = new Set([
  "omitir",
  "omito",
  "no se",
  "no lo se",
  "no se el nombre",
  "no recuerdo",
  "no me acuerdo",
  "no quiero",
  "no quiero decirlo",
  "prefiero no",
  "prefiero no decirlo",
  "ninguno",
  "ninguna",
  "ninguno de estos",
  "sin establecimiento",
  "no tengo",
]);

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** La persona dice que no sabe o no quiere indicar el establecimiento. Se compara el mensaje completo, no una palabra suelta. */
export function quiereOmitirUbicacion(text: string): boolean {
  const normalized = fold(text).toLowerCase().replace(/[.,;:!?¿¡]/g, " ").replace(/\s+/g, " ").trim();
  return OMIT_PHRASES.has(normalized);
}
