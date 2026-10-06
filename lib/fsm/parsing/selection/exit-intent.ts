const EXIT_PATTERNS: readonly RegExp[] = [
  /^(ya )?(me )?(quiero|deseo|necesito) salir( de (aqui|esto|la cita|el chat|este chat))?$/,
  /^salir( de (aqui|esto|la cita|el chat|este chat))?$/,
  /\bya no quiero( (nada|seguir|continuar|la cita|mas|esto))?$/,
  /\bno quiero (nada|seguir|continuar|mas nada)\b/,
  /\bno (voy a|quiero) (seguir|continuar)\b/,
  /\bya no (sigo|continuo)\b/,
  /\bme aburri\b/,
  /\b(que aburrido|estoy aburrid[oa])\b/,
  /\bolvidalo\b/,
  /\bolvidate\b/,
  /\bdejalo( asi)?$/,
  /\bcancela(r)? (la|mi) cita\b/,
  /\bme (canse|harte|rindo)\b/,
];

export function normalizeIntentPhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Frases claras de abandono ("quiero salir", "me aburrí", "ya no quiero nada"); "no" o "cancelar" solos no cuentan. */
export function detectExitIntent(text: string): boolean {
  const phrase = normalizeIntentPhrase(text);
  if (!phrase) return false;
  return EXIT_PATTERNS.some((pattern) => pattern.test(phrase));
}
