import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { REFERENCIA_ESTADOS_SELECCIONABLES } from "@/lib/constants/referencias";
import {
  REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
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

export function etiquetasSeleccionables(): string[] {
  return [...REFERENCIA_ESTADOS_SELECCIONABLES].map((codigo) => REFERENCIA_ESTADO_LABELS[codigo] ?? referenciaEstadoCodigoText(codigo));
}

export function referenciaEspecialidad(item: ReferenciaItem): string {
  return item.upsDestino.trim() ? item.upsDestino : REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT;
}
