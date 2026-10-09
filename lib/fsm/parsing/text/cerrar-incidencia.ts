import { normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";

const CLOSE_PHRASES = new Set(["quiero cerrar", "cerrar", "cerrar sesion", "quiero cerrar la sesion", "terminar la sesion", "quiero terminar la sesion"]);

/** La persona pide cerrar la conversación. Se compara el mensaje completo: un relato que contiene «quiero cerrar» no cancela nada. */
export function quiereCerrar(text: string): boolean {
  return CLOSE_PHRASES.has(normalizeIntentPhrase(text));
}
