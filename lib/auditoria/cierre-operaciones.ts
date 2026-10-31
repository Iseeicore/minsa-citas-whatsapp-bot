import { cerrarOperacionesInterrumpidas } from "@/lib/auditoria/repositorio";
import { CIERRE_OPERACIONES_INTERVALO_MS, CIERRE_OPERACIONES_LOTE, OPERACION_SIN_CIERRE_MS } from "@/lib/constants/limits/auditoria";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { logger } from "@/lib/observability/logger";

type CerrarOperaciones = (antiguedadMs: number, lote: number) => Promise<number>;

let temporizador: ReturnType<typeof setInterval> | undefined;

export async function cerrarOperacionesSinCierre(cerrar: CerrarOperaciones = cerrarOperacionesInterrumpidas): Promise<void> {
  try {
    const cerradas = await cerrar(OPERACION_SIN_CIERRE_MS, CIERRE_OPERACIONES_LOTE);
    logger.info("auditoria.operaciones_interrumpidas", { cerradas });
  } catch (error) {
    logger.error("auditoria.cierre_failed", { error });
  }
}

export function programarCierreOperaciones(cerrar: CerrarOperaciones = cerrarOperacionesInterrumpidas): void {
  if (!isDatabaseEnabled() || temporizador) return;
  void cerrarOperacionesSinCierre(cerrar);
  temporizador = setInterval(() => void cerrarOperacionesSinCierre(cerrar), CIERRE_OPERACIONES_INTERVALO_MS);
  temporizador.unref();
}

export function detenerCierreOperaciones(): void {
  clearInterval(temporizador);
  temporizador = undefined;
}
