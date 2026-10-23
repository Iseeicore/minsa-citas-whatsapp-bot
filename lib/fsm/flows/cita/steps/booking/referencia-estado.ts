import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { REFERENCIA_ESTADOS_SELECCIONABLES } from "@/lib/constants/referencias";
import {
  REFERENCIA_ESTADO_LABELS,
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
  referenciaBloqueadaText,
  referenciaEstadoCodigoText,
} from "@/lib/constants/textos/cita-reserva";

const NINGUNA: ReadonlySet<string> = new Set<string>();

export function esReferenciaSeleccionable(item: ReferenciaItem, sinProgramacion: ReadonlySet<string> = NINGUNA): boolean {
  return REFERENCIA_ESTADOS_SELECCIONABLES.has(item.estado) && !sinProgramacion.has(item.idReferencia);
}

export function tieneReferenciasSeleccionables(items: ReferenciaItem[], sinProgramacion: ReadonlySet<string> = NINGUNA): boolean {
  return items.some((item) => esReferenciaSeleccionable(item, sinProgramacion));
}

export function referenciaEstadoEtiqueta(item: ReferenciaItem, sinProgramacion: ReadonlySet<string> = NINGUNA): string {
  if (sinProgramacion.has(item.idReferencia)) return REFERENCIA_SIN_PROGRAMACION_ETIQUETA;
  const propia = REFERENCIA_ESTADO_LABELS[item.estado];
  if (propia) return propia;
  const descripcion = item.estadoDescripcion?.trim() ?? "";
  return descripcion || referenciaEstadoCodigoText(item.estado);
}

export function referenciaBloqueadaAviso(item: ReferenciaItem, sinProgramacion: ReadonlySet<string> = NINGUNA): string {
  return sinProgramacion.has(item.idReferencia)
    ? REFERENCIA_SIN_PROGRAMACION_TEXT
    : referenciaBloqueadaText(referenciaEstadoEtiqueta(item));
}

export function ordenarReferenciasPorSeleccion(items: ReferenciaItem[], sinProgramacion: ReadonlySet<string> = NINGUNA): ReferenciaItem[] {
  const seleccionable = (item: ReferenciaItem): boolean => esReferenciaSeleccionable(item, sinProgramacion);
  return [...items.filter(seleccionable), ...items.filter((item) => !seleccionable(item))];
}
