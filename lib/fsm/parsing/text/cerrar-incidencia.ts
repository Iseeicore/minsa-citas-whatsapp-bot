import { normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";
import { CERRAR_INCIDENCIA_PHRASES } from "@/lib/constants/palabras-clave";

export function quiereCerrar(text: string): boolean {
  return CERRAR_INCIDENCIA_PHRASES.has(normalizeIntentPhrase(text));
}
