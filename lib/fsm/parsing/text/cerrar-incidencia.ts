import { normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";

const CLOSE_PHRASES = new Set(["quiero cerrar", "cerrar", "cerrar sesion", "quiero cerrar la sesion", "terminar la sesion", "quiero terminar la sesion"]);

export function quiereCerrar(text: string): boolean {
  return CLOSE_PHRASES.has(normalizeIntentPhrase(text));
}
