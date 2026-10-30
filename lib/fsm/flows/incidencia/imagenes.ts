import { z } from "zod";
import { SlotKey } from "@/lib/enums/slot-key";
import type { Slots } from "@/lib/fsm/core/types";
import { readSlotJson, getSlotJsonOr } from "@/lib/fsm/core/slot-readers";

const IMAGENES_SCHEMA = z.array(z.string());

export function readImagenes(slots: Slots): string[] {
  return getSlotJsonOr(readSlotJson(slots, SlotKey.INCIDENCIA_IMAGENES, IMAGENES_SCHEMA), []);
}

export function writeImagenes(slots: Slots, imagenes: string[]): void {
  slots[SlotKey.INCIDENCIA_IMAGENES] = JSON.stringify(imagenes);
}
