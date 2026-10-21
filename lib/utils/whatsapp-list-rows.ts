import type { ListRow, SendInteractiveListEffect } from "@/lib/fsm/core/types";

export function whatsappListRows(effect: SendInteractiveListEffect): ListRow[] {
  return [...effect.rows, ...(effect.actions ?? [])];
}
