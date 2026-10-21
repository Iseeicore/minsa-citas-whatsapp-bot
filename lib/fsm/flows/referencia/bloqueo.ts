import { reshowOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { readOffered } from "@/lib/fsm/parsing/selection/selection-matchers";
import { esReferenciaAgendable, presentarReferencia } from "@/lib/fsm/flows/referencia/presentacion";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { REFERENCIA_SIN_PROGRAMACION_TEXT, referenciaBloqueadaText } from "@/lib/constants/textos/referencia";

export function referenciaBloqueadaAviso(item: ReferenciaItem | undefined, sinProgramacion: readonly string[] = []): string | undefined {
  if (!item) return undefined;
  if (!esReferenciaAgendable(item)) return referenciaBloqueadaText(presentarReferencia(item).etiqueta);
  return sinProgramacion.includes(item.idReferencia) ? REFERENCIA_SIN_PROGRAMACION_TEXT : undefined;
}

export function rechazarReferenciaBloqueada(
  session: Session,
  item: ReferenciaItem | undefined,
  sinProgramacion: readonly string[] = [],
): HandlerResult | undefined {
  const aviso = referenciaBloqueadaAviso(item, sinProgramacion);
  return aviso ? reshowOffered(session, readOffered(session.slots), aviso) : undefined;
}
