import { buildResult, query, withNote } from "@/lib/fsm/core/handlers-shared";
import { channelOf } from "@/lib/fsm/core/channel";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { closeConsulta } from "@/lib/fsm/flows/consulta/cierre";
import { handleAwaitingCodigo, handleAwaitingTipo } from "@/lib/fsm/flows/consulta/codigo";
import { handleCupoPending } from "@/lib/fsm/flows/consulta/cupo";
import {
  handleAwaitingEstablecimiento,
  handleBuscarEstablecimientoPending,
  handleConfirmEstablecimiento,
} from "@/lib/fsm/flows/consulta/establecimiento";
import { handleAwaitingDni, handleQueryPending } from "@/lib/fsm/flows/consulta/resultado";
import { CONSULTA_FALLA_TEXT } from "@/lib/constants/textos/consulta";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { RetiredConsultaState } from "@/lib/enums/retired-consulta-state";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";

type ConsultaHandler = (session: Session, event: HandleEvent) => HandlerResult;

type ActiveConsultaState = Exclude<
  Extract<Session["state"], `consulta_${string}`>,
  `${SessionState.CONSULTA_COMPLETED}` | `${SessionState.CONSULTA_FAILED}`
>;

const RETIRED_STATES: ReadonlySet<string> = new Set(Object.values(RetiredConsultaState));

function onResult(handler: (session: Session, event: QueryResultEvent) => HandlerResult): ConsultaHandler {
  return (session, event) =>
    event.type === InternalEventType.QUERY_RESULT
      ? handler(session, event)
      : closeConsulta(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
}

function onInbound(handler: (session: Session, event: InboundEvent) => HandlerResult): ConsultaHandler {
  return (session, event) => (event.type === InternalEventType.QUERY_RESULT ? buildResult(session, []) : handler(session, event));
}

const CONSULTA_HANDLERS: Readonly<Record<ActiveConsultaState, ConsultaHandler>> = {
  [SessionState.CONSULTA_CUPO_PENDING]: onResult(handleCupoPending),
  [SessionState.CONSULTA_AWAITING_TIPO]: onInbound(handleAwaitingTipo),
  [SessionState.CONSULTA_AWAITING_CODIGO]: onInbound(handleAwaitingCodigo),
  [SessionState.CONSULTA_AWAITING_ESTABLECIMIENTO]: onInbound(handleAwaitingEstablecimiento),
  [SessionState.CONSULTA_BUSCAR_ESTABLECIMIENTO_PENDING]: onResult(handleBuscarEstablecimientoPending),
  [SessionState.CONSULTA_CONFIRM_ESTABLECIMIENTO]: onInbound(handleConfirmEstablecimiento),
  [SessionState.CONSULTA_AWAITING_DNI]: onInbound(handleAwaitingDni),
  [SessionState.CONSULTA_QUERY_PENDING]: onResult(handleQueryPending),
  [SessionState.CONSULTA_INTENTO_PENDING]: onResult(() => closeConsulta(SessionState.CONSULTA_FAILED)),
};

const CONSULTA_HANDLER_BY_STATE = new Map<string, ConsultaHandler>(Object.entries(CONSULTA_HANDLERS));

export function beginConsulta(channel: SessionChannel, codigo?: string): HandlerResult {
  const session: Session = {
    state: SessionState.CONSULTA_CUPO_PENDING,
    slots: { [SlotKey.CONSULTA_CANAL]: channel, ...(codigo ? { [SlotKey.CONSULTA_CODIGO]: codigo } : {}) },
    counters: {},
  };
  return buildResult(session, [query(QueryKind.CONSULTA_CUPO_DIARIO, {})]);
}

export function handleConsulta(session: Session, event: HandleEvent): HandlerResult {
  const handler = CONSULTA_HANDLER_BY_STATE.get(session.state);
  if (handler) return handler(session, event);
  if (!RETIRED_STATES.has(session.state)) throw new UnknownStateError("handleConsulta", session.state);
  return withNote(beginConsulta(channelOf(session, event)), { kind: "retired_state", level: "warn", detail: { state: session.state } });
}
