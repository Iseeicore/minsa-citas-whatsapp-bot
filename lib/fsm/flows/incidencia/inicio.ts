import { buildResult, query } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import type { InicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { readSlotJson, slotJsonOr } from "@/lib/fsm/core/slot-readers";
import { z } from "zod";

export type InicioDenuncia = { codigoRenipress?: string; nombre?: string; lead?: string };

const INICIO_SCHEMA = z.object({
  codigoRenipress: z.string().optional(),
  nombre: z.string().optional(),
  lead: z.string().optional(),
});

export function readInicio(slots: Session["slots"]): InicioDenuncia {
  return slotJsonOr<InicioDenuncia>(readSlotJson(slots, SlotKey.INCIDENCIA_INICIO, INICIO_SCHEMA), {});
}

export function writeInicio(slots: Session["slots"], inicio: InicioDenuncia): void {
  slots[SlotKey.INCIDENCIA_INICIO] = JSON.stringify(inicio);
}

export function beginIncidencia(slots: Session["slots"], lead: string, inicio: InicioIncidencia | null = null): HandlerResult {
  const next: Session = { state: SessionState.INCIDENCIA_CONSENT_CHECK_PENDING, slots: { ...slots }, counters: {} };
  next.slots[SlotKey.INCIDENCIA_ORIGEN] = inicio?.origen ?? IncidenciaOrigen.MENU;
  if (inicio?.resto) next.slots[SlotKey.INCIDENCIA_BORRADOR] = inicio.resto;
  writeInicio(next.slots, { codigoRenipress: inicio?.codigoRenipress, nombre: inicio?.nombre, lead: lead || undefined });
  return buildResult(next, [query(QueryKind.VERIFICAR_CONSENTIMIENTO, {})]);
}
