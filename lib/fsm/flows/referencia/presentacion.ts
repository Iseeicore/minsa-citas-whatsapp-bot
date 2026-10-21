import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { formatEspecialidadName, formatEstablecimientoName } from "@/lib/fsm/flows/cita/data/catalog-names";
import { formatFechaHora12 } from "@/lib/fsm/flows/cita/steps/hora/format";
import { toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import type { ListRow } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { REFERENCIA_ESTADO_CONFIG, REFERENCIA_ESTADOS_AGENDABLES } from "@/lib/constants/referencias";
import { REFERENCIA_FECHA_HORA } from "@/lib/constants/regex/date-time";
import {
  REFERENCIA_ETIQUETA_SIN_PROGRAMACION,
  referenciaEstadoSinDescripcionText,
  referenciaNoAgendableText,
  referenciaResumenText,
  type ReferenciaDerivacion,
  type ReferenciaDetalle,
} from "@/lib/constants/textos/referencia";
import { WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/constants/limits/whatsapp";

export type ReferenciaVista = {
  id: string;
  titulo: string;
  resumen: string;
  etiqueta: string;
  tono: ReferenciaTono;
  agendable: boolean;
  mensaje: string;
  detalle: ReferenciaDetalle;
};

export type ReferenciaRowsOptions = {
  soloAgendables?: boolean;
  sinProgramacion?: readonly string[];
};

function esEstadoAgendable(estado: number): estado is ReferenciaEstadoCodigo {
  return REFERENCIA_ESTADOS_AGENDABLES.has(estado);
}

export function esReferenciaAgendable(item: ReferenciaItem): boolean {
  return esEstadoAgendable(item.estado);
}

function etiquetaDeOtroEstado(item: ReferenciaItem): string {
  const descripcion = item.estadoDescripcion?.trim() ?? "";
  return descripcion ? toDisplayPlace(descripcion) : referenciaEstadoSinDescripcionText(item.estado);
}

function upsDisplay(raw: string): string {
  return raw.trim() ? formatEspecialidadName(raw).full : "";
}

function fechaOrdenable(fechaInicio: string): string {
  const match = REFERENCIA_FECHA_HORA.exec(fechaInicio.trim());
  if (!match) return "";
  const [, day, month, year, hour = "00", minute = "00"] = match;
  return `${year}${month}${day}${hour}${minute}`;
}

function fechaCorta(fechaInicio: string): string {
  const match = REFERENCIA_FECHA_HORA.exec(fechaInicio.trim());
  return match ? `${match[1]}/${match[2]}/${match[3]}` : fechaInicio.trim();
}

export function presentarReferencia(item: ReferenciaItem, sinProgramacion: readonly string[] = []): ReferenciaVista {
  const destino = formatEstablecimientoName(item.ipressDestino);
  const derivacion: ReferenciaDerivacion = {
    origen: formatEstablecimientoName(item.ipressOrigen).full,
    upsOrigen: upsDisplay(item.upsOrigen),
    destino: destino.full,
  };
  const config = esEstadoAgendable(item.estado) ? REFERENCIA_ESTADO_CONFIG[item.estado] : undefined;
  const etiqueta = config?.etiqueta ?? etiquetaDeOtroEstado(item);
  const mensaje = config ? config.mensaje(derivacion) : referenciaNoAgendableText(derivacion, etiqueta);
  const programada = !sinProgramacion.includes(item.idReferencia);
  const etiquetaDeFila = programada ? etiqueta : REFERENCIA_ETIQUETA_SIN_PROGRAMACION;

  return {
    id: item.idReferencia,
    titulo: destino.title || truncateForRow(item.numero, WHATSAPP_ROW_TITLE_MAX),
    resumen: truncateForRow(referenciaResumenText(etiquetaDeFila, item.numero, fechaCorta(item.fechaInicio)), WHATSAPP_ROW_DESCRIPTION_MAX),
    etiqueta,
    tono: programada ? (config?.tono ?? ReferenciaTono.NEUTRO) : ReferenciaTono.NEUTRO,
    agendable: config !== undefined && programada,
    mensaje,
    detalle: {
      numero: item.numero,
      fecha: formatFechaHora12(item.fechaInicio),
      origen: derivacion.origen,
      upsOrigen: derivacion.upsOrigen,
      destino: derivacion.destino,
      upsDestino: upsDisplay(item.upsDestino),
      estado: etiqueta,
      mensaje,
    },
  };
}

export function ordenarReferencias(items: ReferenciaItem[], sinProgramacion: readonly string[] = []): ReferenciaItem[] {
  const disponible = (item: ReferenciaItem): number => Number(esReferenciaAgendable(item) && !sinProgramacion.includes(item.idReferencia));
  return [...items].sort((a, b) => {
    const porEstado = disponible(b) - disponible(a);
    return porEstado || fechaOrdenable(b.fechaInicio).localeCompare(fechaOrdenable(a.fechaInicio));
  });
}

export function referenciaRows(
  items: ReferenciaItem[],
  { soloAgendables = false, sinProgramacion = [] }: ReferenciaRowsOptions = {},
): ListRow[] {
  return ordenarReferencias(soloAgendables ? items.filter(esReferenciaAgendable) : items, sinProgramacion)
    .map((item) => presentarReferencia(item, sinProgramacion))
    .map((vista) => ({
      id: vista.id,
      title: vista.titulo,
      description: vista.resumen,
      tone: vista.tono,
      ...(vista.agendable ? {} : { disabled: true }),
    }));
}
