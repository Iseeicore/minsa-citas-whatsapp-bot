import { isDatabaseEnabled } from "@/lib/db/persistence";
import { logger } from "@/lib/observability/logger";
import type { ConsultaIncidenciaResult, IdentidadConsulta, ListarIncidenciasResult } from "@/lib/recepcion/consulta-dto";
import { buscarIncidenciaDeQuienConsulta, listarIncidenciasDeQuienConsulta } from "@/lib/recepcion/repositorio";

const CODIGO_VALIDO = /^MINSA-\d{4}-\d{6}$/;

/**
 * Consulta de solo lectura. La base apagada o caída es `error` (se avisa «inténtalo más tarde»); una incidencia ajena, borrada o
 * inexistente es siempre `not_found`, sin diferencias observables entre ellas. Solo devuelve código, estado y fecha de registro.
 */
export async function consultarIncidencia(codigo: string, identidad: IdentidadConsulta): Promise<ConsultaIncidenciaResult> {
  if (!isDatabaseEnabled()) {
    logger.error("incidencia.consulta_unavailable", { reason: "DATABASE_ENABLED=false" });
    return { status: "error" };
  }
  if (!CODIGO_VALIDO.test(codigo)) return { status: "not_found" };

  try {
    const fila = await buscarIncidenciaDeQuienConsulta(codigo, identidad);
    if (!fila) return { status: "not_found" };
    return { status: "found", codigo: fila.codigo, estado: fila.estadoCodigo, fechaRegistro: fila.fechaCreacion.toISOString() };
  } catch (error) {
    logger.error("incidencia.consulta_failed", { error });
    return { status: "error" };
  }
}

/** Todas las incidencias de quien consulta, de la más reciente a la más antigua. Solo lectura, mismo criterio de pertenencia. */
export async function listarIncidencias(identidad: IdentidadConsulta): Promise<ListarIncidenciasResult> {
  if (!isDatabaseEnabled()) {
    logger.error("incidencia.listado_unavailable", { reason: "DATABASE_ENABLED=false" });
    return { status: "error" };
  }

  try {
    const filas = await listarIncidenciasDeQuienConsulta(identidad);
    if (filas.length === 0) return { status: "empty" };
    return {
      status: "found",
      items: filas.map((fila) => ({ codigo: fila.codigo, estado: fila.estadoCodigo, fechaRegistro: fila.fechaCreacion.toISOString() })),
    };
  } catch (error) {
    logger.error("incidencia.listado_failed", { error });
    return { status: "error" };
  }
}
