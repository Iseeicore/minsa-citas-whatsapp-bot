import { buildResult, cloneSession, query, readTrimmedText, sendText } from "@/lib/fsm/core/handlers-shared";
import { slotText } from "@/lib/fsm/core/slot-readers";
import type { HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { closeConsulta } from "@/lib/fsm/flows/consulta/cierre";
import { isValidDocumentoFormat } from "@/lib/fsm/parsing/text/identity-format";
import { estadoLegible, fechaLegible, type ConsultaIncidenciaResult } from "@/lib/recepcion/consulta-dto";
import {
  ASK_DNI_TEXT,
  BUSCANDO_INCIDENCIA_TEXT,
  CONSULTA_FALLA_TEXT,
  incidenciaCodigoLineText,
  incidenciaEstadoLineText,
  incidenciaFechaLineText,
  noUbicadaText,
} from "@/lib/constants/textos/consulta";
import { INVALID_DOCUMENT_TEXT } from "@/lib/constants/textos/fallas";
import { MAX_CONSULTAS_POR_DIA } from "@/lib/constants/limits/consulta";
import { ConsultaPayloadKey } from "@/lib/enums/consulta-payload-key";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

function buildFoundText(result: Extract<ConsultaIncidenciaResult, { status: LookupStatus.FOUND }>): string {
  const fecha = fechaLegible(result.fechaRegistro);
  return [
    incidenciaCodigoLineText(result.codigo),
    incidenciaEstadoLineText(estadoLegible(result.estado)),
    ...(fecha ? [incidenciaFechaLineText(fecha)] : []),
  ].join("\n");
}

function toRestantesHoy(session: Session): number {
  return MAX_CONSULTAS_POR_DIA - ((session.slots[SlotKey.CONSULTA_USADAS_HOY] ?? 0) + 1);
}

export function askDni(next: Session): HandlerResult {
  next.state = SessionState.CONSULTA_AWAITING_DNI;
  return buildResult(next, [sendText(ASK_DNI_TEXT)]);
}

export function startSearch(next: Session): HandlerResult {
  next.state = SessionState.CONSULTA_QUERY_PENDING;
  const anonima = next.slots[SlotKey.CONSULTA_ANONIMA] === true;
  return buildResult(next, [
    sendText(BUSCANDO_INCIDENCIA_TEXT),
    query(QueryKind.CONSULTAR_INCIDENCIA, {
      [ConsultaPayloadKey.CODIGO]: slotText(next.slots, SlotKey.CONSULTA_CODIGO),
      [ConsultaPayloadKey.ESTABLECIMIENTO_ID]: next.slots[SlotKey.CONSULTA_ESTABLECIMIENTO_ID],
      [ConsultaPayloadKey.ANONIMA]: anonima,
      [ConsultaPayloadKey.CANAL]: slotText(next.slots, SlotKey.CONSULTA_CANAL),
      ...(anonima ? {} : { [ConsultaPayloadKey.DNI]: slotText(next.slots, SlotKey.CONSULTA_DNI) }),
    }),
  ]);
}

export function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const documento = readTrimmedText(event);
  if (!isValidDocumentoFormat(documento)) return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);

  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_DNI] = documento;
  return startSearch(next);
}

export function handleQueryPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as ConsultaIncidenciaResult | undefined;
  if (result?.status === LookupStatus.FOUND) return closeConsulta(SessionState.CONSULTA_COMPLETED, buildFoundText(result));
  if (result?.status === LookupStatus.NOT_FOUND)
    return closeConsulta(SessionState.CONSULTA_COMPLETED, noUbicadaText(toRestantesHoy(session)));
  return closeConsulta(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
}
