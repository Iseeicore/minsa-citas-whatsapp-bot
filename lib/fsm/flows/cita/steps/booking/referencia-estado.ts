import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { REFERENCIA_ESTADOS_SELECCIONABLES } from "@/lib/constants/referencias";
import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { WHATSAPP_REFERENCIA_BLOQUEADA_LINEA_MAX, WHATSAPP_REFERENCIAS_BLOQUEADAS_MAX } from "@/lib/constants/limits/whatsapp-reference";
import {
  REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT,
  REFERENCIA_ESTADO_LABELS,
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
  REFERENCIAS_BLOQUEADAS_TITULO_TEXT,
  referenciaBloqueadaLineaText,
  referenciaBloqueadaText,
  referenciasBloqueadasRestantesText,
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

export function etiquetasSeleccionables(): string[] {
  return [...REFERENCIA_ESTADOS_SELECCIONABLES].map((codigo) => REFERENCIA_ESTADO_LABELS[codigo] ?? referenciaEstadoCodigoText(codigo));
}

export function referenciaEspecialidad(item: ReferenciaItem): string {
  return item.upsDestino.trim() ? item.upsDestino : REFERENCIA_ESPECIALIDAD_NO_INFORMADA_TEXT;
}

export function referenciasBloqueadasAviso(items: ReferenciaItem[], sinProgramacion: ReadonlySet<string> = NINGUNA): string | undefined {
  const bloqueadas = items.filter((item) => !esReferenciaSeleccionable(item, sinProgramacion));
  if (bloqueadas.length === 0) return undefined;
  const lineas = bloqueadas.slice(0, WHATSAPP_REFERENCIAS_BLOQUEADAS_MAX).map((item) => {
    const linea = referenciaBloqueadaLineaText(
      referenciaEspecialidad(item),
      item.ipressDestino,
      item.numero,
      referenciaEstadoEtiqueta(item, sinProgramacion),
    );
    return truncateForRow(linea, WHATSAPP_REFERENCIA_BLOQUEADA_LINEA_MAX);
  });
  const restantes = bloqueadas.length - lineas.length;
  const resumen = restantes > 0 ? [referenciasBloqueadasRestantesText(restantes)] : [];
  return [REFERENCIAS_BLOQUEADAS_TITULO_TEXT, ...lineas, ...resumen].join("\n");
}
