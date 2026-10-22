import type { Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { arrayOr } from "@/lib/utils/array-values";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isString } from "@/lib/utils/type-guards";
import { cloneSession } from "@/lib/fsm/core/handlers-shared";

export function referenciaSeleccionadaId(slots: Session["slots"]): string | undefined {
  const id = slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  return isString(id) && id ? id : undefined;
}

export function readReferencias(session: Session): ReferenciaItem[] {
  const raw = session.slots[SlotKey.CITA_REFERENCIAS_DATA];
  return isString(raw) ? arrayOr<ReferenciaItem>(parseJsonOr(raw, [])) : [];
}

export function readReferenciasSinProgramacion(session: Session): ReadonlySet<string> {
  const raw = session.slots[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION];
  return new Set(isString(raw) ? arrayOr<unknown>(parseJsonOr(raw, [])).filter(isString) : []);
}

export function marcarReferenciaSinProgramacion(session: Session): Session {
  const id = referenciaSeleccionadaId(session.slots);
  const next = cloneSession(session);
  if (!id) return next;
  next.slots[SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION] = JSON.stringify([...new Set([...readReferenciasSinProgramacion(session), id])]);
  return next;
}

export function referenciaSeleccionada(session: Session): ReferenciaItem | undefined {
  const selectedId = referenciaSeleccionadaId(session.slots);
  return readReferencias(session).find((item) => item.idReferencia === selectedId);
}

export function isReferenceAppointment(session: Session): boolean {
  return referenciaSeleccionadaId(session.slots) !== undefined;
}
