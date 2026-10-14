import { isDatabaseEnabled } from "@/lib/db/persistence";
import { logger } from "@/lib/observability/logger";
import type { ConsultaIncidenciaResult, IdentidadConsulta, ListarIncidenciasResult } from "@/lib/recepcion/consulta-dto";
import { buscarIncidenciaDeQuienConsulta, listarIncidenciasDeQuienConsulta } from "@/lib/recepcion/repositorio";
import { CODIGO_VALIDO } from "@/lib/constants/regex/incidencia";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { ReferenceStatus } from "@/lib/enums/reference-status";

export async function consultarIncidencia(codigo: string, identidad: IdentidadConsulta): Promise<ConsultaIncidenciaResult> {
  if (!isDatabaseEnabled()) {
    logger.error("incidencia.consulta_unavailable", { reason: "DATABASE_ENABLED=false" });
    return { status: LookupStatus.ERROR };
  }
  if (!CODIGO_VALIDO.test(codigo)) return { status: LookupStatus.NOT_FOUND };

  try {
    const fila = await buscarIncidenciaDeQuienConsulta(codigo, identidad);
    if (!fila) return { status: LookupStatus.NOT_FOUND };
    return { status: LookupStatus.FOUND, codigo: fila.codigo, estado: fila.estadoCodigo, fechaRegistro: fila.fechaCreacion.toISOString() };
  } catch (error) {
    logger.error("incidencia.consulta_failed", { error });
    return { status: LookupStatus.ERROR };
  }
}

export async function listarIncidencias(identidad: IdentidadConsulta): Promise<ListarIncidenciasResult> {
  if (!isDatabaseEnabled()) {
    logger.error("incidencia.listado_unavailable", { reason: "DATABASE_ENABLED=false" });
    return { status: ReferenceStatus.ERROR };
  }

  try {
    const filas = await listarIncidenciasDeQuienConsulta(identidad);
    if (filas.length === 0) return { status: ReferenceStatus.EMPTY };
    return {
      status: ReferenceStatus.FOUND,
      items: filas.map((fila) => ({ codigo: fila.codigo, estado: fila.estadoCodigo, fechaRegistro: fila.fechaCreacion.toISOString() })),
    };
  } catch (error) {
    logger.error("incidencia.listado_failed", { error });
    return { status: ReferenceStatus.ERROR };
  }
}
