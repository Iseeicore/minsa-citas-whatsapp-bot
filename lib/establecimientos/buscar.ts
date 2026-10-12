import type { Candidato, Establecimiento } from "@/lib/establecimientos/decidir";
import { buscarPorCodigo, buscarPorNombre } from "@/lib/establecimientos/repositorio";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";

export type BuscarEstablecimientoResult =
  | { by: `${EstablecimientoSearchBy.CODIGO}`; status: `${EstablecimientoSearchStatus.FOUND}`; establecimiento: Establecimiento }
  | { by: `${EstablecimientoSearchBy.CODIGO}`; status: `${EstablecimientoSearchStatus.NOT_FOUND}` }
  | { by: `${EstablecimientoSearchBy.NOMBRE}`; status: `${EstablecimientoSearchStatus.OK}`; candidatos: Candidato[] }
  | { by: `${EstablecimientoSearchBy.CODIGO}` | `${EstablecimientoSearchBy.NOMBRE}`; status: `${EstablecimientoSearchStatus.UNAVAILABLE}` };

export async function buscarEstablecimiento(payload: { codigo?: unknown; nombre?: unknown }): Promise<BuscarEstablecimientoResult> {
  const codigo = typeof payload.codigo === "string" ? payload.codigo : "";
  if (codigo) {
    const result = await buscarPorCodigo(codigo);
    return result.status === EstablecimientoSearchStatus.UNAVAILABLE ? { by: EstablecimientoSearchBy.CODIGO, status: EstablecimientoSearchStatus.UNAVAILABLE } : { by: EstablecimientoSearchBy.CODIGO, ...result };
  }
  const nombre = typeof payload.nombre === "string" ? payload.nombre : "";
  const result = await buscarPorNombre(nombre);
  return result.status === EstablecimientoSearchStatus.OK ? { by: EstablecimientoSearchBy.NOMBRE, status: EstablecimientoSearchStatus.OK, candidatos: result.candidatos } : { by: EstablecimientoSearchBy.NOMBRE, status: EstablecimientoSearchStatus.UNAVAILABLE };
}
