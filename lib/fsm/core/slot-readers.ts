import type { SlotKey } from "@/lib/enums/slot-key";
import type { Slots } from "@/lib/fsm/core/types";
import { toText } from "@/lib/utils/text-values";

export function slotText(slots: Slots, key: SlotKey): string {
  return toText(slots[key]);
}

export function payloadText(payload: Record<string, unknown>, key: string): string {
  return toText(payload[key]);
}
