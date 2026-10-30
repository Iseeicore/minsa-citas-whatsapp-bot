import { SlotKey } from "@/lib/enums/slot-key";
import type { Slots } from "@/lib/fsm/core/types";
import { isString } from "@/lib/utils/type-guards";

export function readImagenes(slots: Slots): string[] {
  const raw = slots[SlotKey.INCIDENCIA_IMAGENES];
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isString) : [];
  } catch {
    return [];
  }
}

export function writeImagenes(slots: Slots, imagenes: string[]): void {
  slots[SlotKey.INCIDENCIA_IMAGENES] = JSON.stringify(imagenes);
}
