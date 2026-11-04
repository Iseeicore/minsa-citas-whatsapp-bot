import { orderHorasFromNow } from "@/lib/fsm/flows/cita/steps/hora/format";
import { formatFechaForApi } from "@/lib/integrations/minsa/format";
import type { ListFechasResult, ListHorasResult } from "@/lib/integrations/minsa/types";
import { nowInLima } from "@/lib/time/lima-clock";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { logger } from "@/lib/observability/logger";

async function hasHorasLeftToday(fechaCupo: string, horasOf: (fecha: string) => Promise<ListHorasResult>): Promise<boolean> {
  try {
    const horas = await horasOf(formatFechaForApi(fechaCupo));
    if (horas.status === CatalogStatus.EMPTY) return false;
    if (horas.status !== CatalogStatus.FOUND) return true;
    return orderHorasFromNow(fechaCupo, horas.items).length > 0;
  } catch (error: unknown) {
    logger.warn("cita.fechas.today_check_failed", { error });
    return true;
  }
}

export async function withoutTodayIfNoHorasLeft(
  fechas: ListFechasResult,
  horasOf: (fecha: string) => Promise<ListHorasResult>,
): Promise<ListFechasResult> {
  if (fechas.status !== CatalogStatus.FOUND) return fechas;
  const today = nowInLima().fecha;
  const todayItem = fechas.items.find((item) => formatFechaForApi(item.fechaCupo) === today);
  if (!todayItem || (await hasHorasLeftToday(todayItem.fechaCupo, horasOf))) return fechas;
  const items = fechas.items.filter((item) => item !== todayItem);
  return items.length > 0 ? { status: CatalogStatus.FOUND, items } : { status: CatalogStatus.EMPTY };
}
