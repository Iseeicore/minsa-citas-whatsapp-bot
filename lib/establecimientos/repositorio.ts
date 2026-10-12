import { Prisma } from "@prisma/client";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { prisma } from "@/lib/db/prisma";
import { MIN_SIMILITUD, MIN_SIMILITUD_PALABRA, type Candidato, type Establecimiento } from "@/lib/establecimientos/decidir";
import { variantesConsulta } from "@/lib/establecimientos/consulta";
import { logger } from "@/lib/observability/logger";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";

export type ResultadoPorCodigo =
  | { status: `${EstablecimientoSearchStatus.FOUND}`; establecimiento: Establecimiento }
  | { status: `${EstablecimientoSearchStatus.NOT_FOUND}` }
  | { status: `${EstablecimientoSearchStatus.UNAVAILABLE}` };

export type ResultadoPorNombre = { status: `${EstablecimientoSearchStatus.OK}`; candidatos: Candidato[] } | { status: `${EstablecimientoSearchStatus.UNAVAILABLE}` };

const DEFAULT_LIMIT = 8;

export async function buscarPorCodigo(codigoRenipress: string): Promise<ResultadoPorCodigo> {
  if (!isDatabaseEnabled()) return { status: EstablecimientoSearchStatus.UNAVAILABLE };
  try {
    const fila = await prisma.establecimientoSalud.findFirst({
      where: { codigoRenipress, activo: true },
      select: { id: true, areaId: true, codigoRenipress: true, nombre: true, distrito: true },
    });
    return fila ? { status: EstablecimientoSearchStatus.FOUND, establecimiento: fila } : { status: EstablecimientoSearchStatus.NOT_FOUND };
  } catch (error) {
    logger.error("incidencia.establecimiento_lookup_failed", { by: EstablecimientoSearchBy.CODIGO, error });
    return { status: EstablecimientoSearchStatus.UNAVAILABLE };
  }
}

export async function buscarPorNombre(texto: string, limite: number = DEFAULT_LIMIT): Promise<ResultadoPorNombre> {
  if (!isDatabaseEnabled()) return { status: EstablecimientoSearchStatus.UNAVAILABLE };
  const [original, expandida] = variantesConsulta(texto);
  if (original === "") return { status: EstablecimientoSearchStatus.OK, candidatos: [] };
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
    return { status: EstablecimientoSearchStatus.OK, candidatos: filas };
  } catch (error) {
    logger.error("incidencia.establecimiento_lookup_failed", { by: EstablecimientoSearchBy.NOMBRE, error });
    return { status: EstablecimientoSearchStatus.UNAVAILABLE };
  }
}
