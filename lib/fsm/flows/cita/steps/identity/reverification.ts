import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { REVERIFICATION_PROMPT_TEXT, reverifiedText } from "@/lib/constants/textos/cita-identidad";
import { SEARCHING_UBIGEO_TEXT, SEARCHING_ESPECIALIDADES_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import { SEARCHING_FECHAS_TEXT, SEARCHING_HORARIOS_TEXT } from "@/lib/constants/textos/cita-fecha-hora";
import { SEARCHING_ESTABLECIMIENTOS_TEXT } from "@/lib/constants/textos/cita-catalogo";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { askOtherReference } from "@/lib/fsm/flows/referencia/other-reference";

export function beginReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_RESUME_STATE] = resumeState;
  delete next.slots[SlotKey.CITA_BEARER];
  next.state = SessionState.CITA_AWAITING_DNI;
  return buildResult(next, [sendText(REVERIFICATION_PROMPT_TEXT)]);
}

export function resumeAfterReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.state = resumeState as Session["state"];

  switch (resumeState) {
    case SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE:
      return askOtherReference(next);

    case SessionState.CITA_UBIGEO_PENDING:
      return buildResult(next, [
        sendText(reverifiedText(SEARCHING_UBIGEO_TEXT)),
        query(QueryKind.SEARCH_UBIGEO, {
          departamento: slotText(next.slots, SlotKey.CITA_DEPARTAMENTO),
          provincia: slotText(next.slots, SlotKey.CITA_PROVINCIA),
          distrito: slotText(next.slots, SlotKey.CITA_DISTRITO),
        }),
      ]);

    case SessionState.CITA_ESPECIALIDAD_PENDING:
      return buildResult(next, [
        sendText(reverifiedText(SEARCHING_ESPECIALIDADES_TEXT)),
        query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO) }),
      ]);

    case SessionState.CITA_ESTABLECIMIENTO_PENDING:
      return buildResult(next, [
        sendText(reverifiedText(SEARCHING_ESTABLECIMIENTOS_TEXT)),
        query(QueryKind.LIST_ESTABLECIMIENTOS, {
          especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
          ubigeo: slotText(next.slots, SlotKey.CITA_UBIGEO),
          page: next.counters[CounterKey.CITA_ESTABLECIMIENTOS_PAGE] ?? 1,
        }),
      ]);

    case SessionState.CITA_FECHA_PENDING:
      return buildResult(next, [
        sendText(reverifiedText(SEARCHING_FECHAS_TEXT)),
        query(QueryKind.LIST_FECHAS, {
          codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
          especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
        }),
      ]);

    case SessionState.CITA_HORA_PENDING:
    default:
      return buildResult(next, [
        sendText(reverifiedText(SEARCHING_HORARIOS_TEXT)),
        query(QueryKind.LIST_HORAS, {
          codEess: slotText(next.slots, SlotKey.CITA_COD_EESS),
          especialidadId: slotText(next.slots, SlotKey.CITA_ESPECIALIDAD_ID),
          fecha: slotText(next.slots, SlotKey.CITA_FECHA),
        }),
      ]);
  }
}
