import type { Session } from "@/lib/fsm/core/types";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { readSlotJson, slotJsonOr } from "@/lib/fsm/core/slot-readers";
import { z } from "zod";
import { isString } from "@/lib/utils/type-guards";
import { cloneSession } from "@/lib/fsm/core/handlers-shared";

export function referenciaSeleccionadaId(slots: Session["slots"]): string | undefined {
  const id = slots[SlotKey.CITA_REFERENCIA_SELECCIONADA_ID];
  return isString(id) && id ? id : undefined;
}

const REFERENCIAS_SCHEMA = z.array(z.looseObject({ idReferencia: z.string() }));

const SIN_PROGRAMACION_SCHEMA = z.array(z.string());

export function readReferencias(session: Session): ReferenciaItem[] {
  return slotJsonOr(readSlotJson(session.slots, SlotKey.CITA_REFERENCIAS_DATA, REFERENCIAS_SCHEMA), []) as ReferenciaItem[];
}

export function readReferenciasSinProgramacion(session: Session): ReadonlySet<string> {
  return new Set(slotJsonOr(readSlotJson(session.slots, SlotKey.CITA_REFERENCIAS_SIN_PROGRAMACION, SIN_PROGRAMACION_SCHEMA), []));
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
