import { isDatabaseEnabled } from "@/lib/db/persistence";
import { logger } from "@/lib/observability/logger";
import { saveIntentoConsulta } from "@/lib/consulta/cupo-diario";
import type { ConsultaIncidenciaResult } from "@/lib/recepcion/consulta-dto";
import { findIncidenciaParaConsulta } from "@/lib/recepcion/repositorio";
import { CODIGO_VALIDO } from "@/lib/constants/regex/incidencia";
import { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import type { ConsultaIncidencia, QuienConsulta } from "@/lib/types/consulta-incidencia.types";
import type { CupoDiarioStore } from "@/lib/types/cupo-diario.types";

const RESULTADO_POR_STATUS: Readonly<Record<LookupStatus, ResultadoIntentoConsulta>> = {
  [LookupStatus.FOUND]: ResultadoIntentoConsulta.ENCONTRADA,
  [LookupStatus.NOT_FOUND]: ResultadoIntentoConsulta.NO_ENCONTRADA,
  [LookupStatus.ERROR]: ResultadoIntentoConsulta.ERROR,
};

async function getEstadoIncidencia(consulta: ConsultaIncidencia): Promise<ConsultaIncidenciaResult> {
  if (!isDatabaseEnabled()) {
    logger.error("incidencia.consulta_unavailable", { reason: "DATABASE_ENABLED=false" });
    return { status: LookupStatus.ERROR };
  }
  if (!CODIGO_VALIDO.test(consulta.codigo)) return { status: LookupStatus.NOT_FOUND };

  try {
    const fila = await findIncidenciaParaConsulta(consulta);
    if (!fila) return { status: LookupStatus.NOT_FOUND };
    return { status: LookupStatus.FOUND, codigo: fila.codigo, estado: fila.estadoCodigo, fechaRegistro: fila.fechaCreacion.toISOString() };
  } catch (error) {
    logger.error("incidencia.consulta_failed", { error });
    return { status: LookupStatus.ERROR };
  }
}

export async function consultarIncidencia(
  consulta: ConsultaIncidencia,
  quien: QuienConsulta,
  cupo: CupoDiarioStore,
): Promise<ConsultaIncidenciaResult> {
  const result = await getEstadoIncidencia(consulta);
  const intento = await saveIntentoConsulta({ ...quien, resultado: RESULTADO_POR_STATUS[result.status] }, cupo);
  return intento.statusCupo === CupoDiarioStatus.SAVED ? result : { status: LookupStatus.ERROR };
}
