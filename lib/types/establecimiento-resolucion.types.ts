import type { Establecimiento } from "@/lib/establecimientos/decidir";
import type { EstablecimientoResolucion } from "@/lib/enums/establecimiento-resolucion";
import type { EstablecimientoSearchBy } from "@/lib/enums/establecimiento-search-by";

export type EstablecimientoQuery = { codigo: string } | { nombre: string };

export type ResolucionEstablecimiento =
  | { kind: EstablecimientoResolucion.UNO; establecimiento: Establecimiento }
  | { kind: EstablecimientoResolucion.VARIOS }
  | { kind: EstablecimientoResolucion.NINGUNO; by: EstablecimientoSearchBy }
  | { kind: EstablecimientoResolucion.NO_DISPONIBLE };
