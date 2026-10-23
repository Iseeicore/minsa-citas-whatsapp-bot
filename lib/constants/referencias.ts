import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";

export const REFERENCIA_ESTADOS_SELECCIONABLES: ReadonlySet<number> = new Set<number>([
  ReferenciaEstadoCodigo.ACEPTADO,
  ReferenciaEstadoCodigo.PACIENTE_RECIBIDO,
]);
