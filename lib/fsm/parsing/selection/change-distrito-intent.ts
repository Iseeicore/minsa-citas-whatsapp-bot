import { normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";

const PLACE = "(distrito|ubicacion|zona|lugar)";

const CHANGE_DISTRITO_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b(otro|otra) ${PLACE}\b`),
  new RegExp(String.raw`\bcambiar(lo|la)? (de |el |la |mi )?${PLACE}\b`),
  new RegExp(String.raw`\bno quiero (esta|esa|este|ese) ${PLACE}\b`),
  new RegExp(String.raw`\bme equivoque de ${PLACE}\b`),
  new RegExp(String.raw`\b(ese|este|esa|esta) no es (mi|el|la) ${PLACE}\b`),
];

/** Frases claras de querer otro distrito o ubicación ("ya no quiero esta ubicación", "otro distrito"); no cubre fechas ni establecimientos. */
export function detectChangeDistritoIntent(text: string): boolean {
  const phrase = normalizeIntentPhrase(text);
  if (!phrase) return false;
  return CHANGE_DISTRITO_PATTERNS.some((pattern) => pattern.test(phrase));
}
