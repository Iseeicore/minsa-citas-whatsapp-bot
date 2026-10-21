import type { Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { arrayOr } from "@/lib/utils/array-values";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isString } from "@/lib/utils/type-guards";

export function referenciaSeleccionadaId(slots: Session["slots"]): string | undefined {
  const id = slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  return isString(id) && id ? id : undefined;
}

export function readReferencias(session: Session): ReferenciaItem[] {
  const raw = session.slots[SlotKey.CITA_REFERENCIAS_DATA];
  return isString(raw) ? arrayOr<ReferenciaItem>(parseJsonOr(raw, [])) : [];
}

export function referenciaSeleccionada(session: Session): ReferenciaItem | undefined {
  const selectedId = referenciaSeleccionadaId(session.slots);
  return readReferencias(session).find((item) => item.idReferencia === selectedId);
}

export function isReferenceAppointment(session: Session): boolean {
  return referenciaSeleccionadaId(session.slots) !== undefined;
}
