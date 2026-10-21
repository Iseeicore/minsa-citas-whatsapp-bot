import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import {
  REFERENCIA_ETIQUETA_ACEPTADO,
  REFERENCIA_ETIQUETA_PACIENTE_CITADO,
  REFERENCIA_ETIQUETA_PACIENTE_RECIBIDO,
  referenciaAceptadaText,
  referenciaCitadaText,
  referenciaRecibidaText,
  type ReferenciaDerivacion,
} from "@/lib/constants/textos/referencia";

export type ReferenciaEstadoConfig = {
  etiqueta: string;
  tono: ReferenciaTono;
  mensaje: (derivacion: ReferenciaDerivacion) => string;
};

export const REFERENCIA_ESTADOS_AGENDABLES: ReadonlySet<number> = new Set<number>([
  ReferenciaEstadoCodigo.ACEPTADO,
  ReferenciaEstadoCodigo.PACIENTE_RECIBIDO,
  ReferenciaEstadoCodigo.PACIENTE_CITADO,
]);

export const REFERENCIA_ESTADO_CONFIG: Record<ReferenciaEstadoCodigo, ReferenciaEstadoConfig> = {
  [ReferenciaEstadoCodigo.ACEPTADO]: {
    etiqueta: REFERENCIA_ETIQUETA_ACEPTADO,
    tono: ReferenciaTono.EXITO,
    mensaje: referenciaAceptadaText,
  },
  [ReferenciaEstadoCodigo.PACIENTE_RECIBIDO]: {
    etiqueta: REFERENCIA_ETIQUETA_PACIENTE_RECIBIDO,
    tono: ReferenciaTono.EXITO,
    mensaje: referenciaRecibidaText,
  },
  [ReferenciaEstadoCodigo.PACIENTE_CITADO]: {
    etiqueta: REFERENCIA_ETIQUETA_PACIENTE_CITADO,
    tono: ReferenciaTono.INFO,
    mensaje: referenciaCitadaText,
  },
};
