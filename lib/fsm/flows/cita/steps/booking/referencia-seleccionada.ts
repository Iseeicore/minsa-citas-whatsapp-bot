import type { Session } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

export function referenciaSeleccionadaId(slots: Session["slots"]): string | undefined {
  const id = slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  return typeof id === "string" && id ? id : undefined;
}
