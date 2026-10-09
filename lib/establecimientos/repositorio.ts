import { Prisma } from "@prisma/client";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { prisma } from "@/lib/db/prisma";
import { MIN_SIMILITUD, MIN_SIMILITUD_PALABRA, type Candidato, type Establecimiento } from "@/lib/establecimientos/decidir";
import { variantesConsulta } from "@/lib/establecimientos/consulta";
import { logger } from "@/lib/observability/logger";

export type ResultadoPorCodigo =
  | { status: "found"; establecimiento: Establecimiento }
  | { status: "not_found" }
  | { status: "unavailable" };

export type ResultadoPorNombre = { status: "ok"; candidatos: Candidato[] } | { status: "unavailable" };

const DEFAULT_LIMIT = 8;

/** Busca un establecimiento activo por su código RENIPRESS (ya sin ceros). Si la base no responde, devuelve unavailable en vez de lanzar. */
export async function buscarPorCodigo(codigoRenipress: string): Promise<ResultadoPorCodigo> {
  if (!isDatabaseEnabled()) return { status: "unavailable" };
  try {
    const fila = await prisma.establecimientoSalud.findFirst({
      where: { codigoRenipress, activo: true },
      select: { id: true, areaId: true, codigoRenipress: true, nombre: true, distrito: true },
    });
    return fila ? { status: "found", establecimiento: fila } : { status: "not_found" };
  } catch (error) {
    logger.error("incidencia.establecimiento_lookup_failed", { by: "codigo", error });
    return { status: "unavailable" };
  }
}

/** Busca por parecido de nombre (pg_trgm sobre nombre_busqueda) con el texto tal cual y con los sinónimos del padrón; toma la mejor de las dos. Trae solo los que pasan el umbral. */
export async function buscarPorNombre(texto: string, limite: number = DEFAULT_LIMIT): Promise<ResultadoPorNombre> {
  if (!isDatabaseEnabled()) return { status: "unavailable" };
  const [original, expandida] = variantesConsulta(texto);
  if (original === "") return { status: "ok", candidatos: [] };
  try {
    const filas = await prisma.$queryRaw<Candidato[]>(Prisma.sql`
      SELECT s.id, s."areaId", s."codigoRenipress", s.nombre, s.distrito, s."similitud", s."similitudPalabra"
        FROM (SELECT e.id, e.area_id AS "areaId", e.codigo_renipress AS "codigoRenipress", e.nombre, e.distrito,
                     GREATEST(similarity(e.nombre_busqueda, ${original}::text), similarity(e.nombre_busqueda, ${expandida}::text)) AS "similitud",
                     GREATEST(word_similarity(${original}::text, e.nombre_busqueda), word_similarity(${expandida}::text, e.nombre_busqueda)) AS "similitudPalabra"
                FROM catalogo.establecimiento_salud e
               WHERE e.activo) s
       WHERE s."similitud" >= ${MIN_SIMILITUD} OR s."similitudPalabra" >= ${MIN_SIMILITUD_PALABRA}
       ORDER BY s."similitud" DESC, s."similitudPalabra" DESC
       LIMIT ${limite}`);
    return { status: "ok", candidatos: filas };
  } catch (error) {
    logger.error("incidencia.establecimiento_lookup_failed", { by: "nombre", error });
    return { status: "unavailable" };
  }
}
