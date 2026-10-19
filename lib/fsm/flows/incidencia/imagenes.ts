import { SlotKey } from "@/lib/enums/slot-key";
import type { Slots } from "@/lib/fsm/core/types";

/** Las imágenes de la incidencia viven en la sesión como un arreglo JSON de data URI hasta que se registra. */
export function readImagenes(slots: Slots): string[] {
  const raw = slots[SlotKey.INCIDENCIA_IMAGENES];
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeImagenes(slots: Slots, imagenes: string[]): void {
  slots[SlotKey.INCIDENCIA_IMAGENES] = JSON.stringify(imagenes);
}
