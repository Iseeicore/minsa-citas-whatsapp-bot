import type { Candidato, Establecimiento } from "@/lib/establecimientos/decidir";
import { buscarPorCodigo, buscarPorNombre } from "@/lib/establecimientos/repositorio";

export type BuscarEstablecimientoResult =
  | { by: "codigo"; status: "found"; establecimiento: Establecimiento }
  | { by: "codigo"; status: "not_found" }
  | { by: "nombre"; status: "ok"; candidatos: Candidato[] }
  | { by: "codigo" | "nombre"; status: "unavailable" };

/** Resuelve la consulta del flujo: por código si lo trae, y si no por nombre. Nunca lanza. */
export async function buscarEstablecimiento(payload: { codigo?: unknown; nombre?: unknown }): Promise<BuscarEstablecimientoResult> {
  const codigo = typeof payload.codigo === "string" ? payload.codigo : "";
  if (codigo) {
    const result = await buscarPorCodigo(codigo);
    return result.status === "unavailable" ? { by: "codigo", status: "unavailable" } : { by: "codigo", ...result };
  }
  const nombre = typeof payload.nombre === "string" ? payload.nombre : "";
  const result = await buscarPorNombre(nombre);
  return result.status === "ok" ? { by: "nombre", status: "ok", candidatos: result.candidatos } : { by: "nombre", status: "unavailable" };
}
