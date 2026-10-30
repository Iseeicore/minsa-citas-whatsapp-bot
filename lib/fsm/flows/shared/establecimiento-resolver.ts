import type { BuscarEstablecimientoResult } from "@/lib/establecimientos/buscar";
import { decidirCandidatos } from "@/lib/establecimientos/decidir";
import { parseCodigoSuelto } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { EstablecimientoDecision } from "@/lib/enums/establecimiento-decision";
import { EstablecimientoResolucion } from "@/lib/enums/establecimiento-resolucion";
import { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";
import { EstablecimientoSearchStatus } from "@/lib/enums/establecimiento-search-status";
import type { EstablecimientoQuery, ResolucionEstablecimiento } from "@/lib/types/establecimiento-resolucion.types";

export function parseEstablecimientoQuery(text: string): EstablecimientoQuery | undefined {
  const codigo = parseCodigoSuelto(text);
  if (codigo) return { codigo };
  return looksLikeNoise(text) ? undefined : { nombre: text };
}

export function toEstablecimientoResolucion(result: BuscarEstablecimientoResult): ResolucionEstablecimiento {
  if (result.status === EstablecimientoSearchStatus.UNAVAILABLE) return { kind: EstablecimientoResolucion.NO_DISPONIBLE };
  if (result.by === EstablecimientoSearchBy.CODIGO) {
    return result.status === EstablecimientoSearchStatus.FOUND
      ? { kind: EstablecimientoResolucion.UNO, establecimiento: result.establecimiento }
      : { kind: EstablecimientoResolucion.NINGUNO, by: EstablecimientoSearchBy.CODIGO };
  }

  const decision = decidirCandidatos(result.candidatos);
  if (decision.kind === EstablecimientoDecision.UNO)
    return { kind: EstablecimientoResolucion.UNO, establecimiento: decision.establecimiento };
  if (decision.kind === EstablecimientoDecision.VARIOS) return { kind: EstablecimientoResolucion.VARIOS };
  return { kind: EstablecimientoResolucion.NINGUNO, by: EstablecimientoSearchBy.NOMBRE };
}
