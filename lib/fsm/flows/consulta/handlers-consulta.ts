import { SelectionOutcomeKind } from "@/lib/enums/selection-outcome-kind";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  truncateForRow,
  readTappedId,
  readTrimmedText,
} from "@/lib/fsm/core/handlers-shared";
import { resolveSelection } from "@/lib/fsm/flows/cita/parsing/selection";
import type { HandleEvent, HandlerResult, InboundEvent, ListRow, QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { validateUserQuery } from "@/lib/fsm/flows/cita/steps/identity/validate-user-query";
import { extractCodigoIncidencia } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { isValidDocumentoFormat, isValidOtpFormat } from "@/lib/fsm/parsing/text/identity-format";
import { estadoLegible, fechaLegible, type ConsultaIncidenciaResult, type ListarIncidenciasResult } from "@/lib/recepcion/consulta-dto";
import { ConsultaCodigoButtonId } from "@/lib/enums/consulta-codigo-button-id";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import {
  ASK_CODIGO_TEXT,
  ASK_CODIGO_O_LISTAR_TEXT,
  INVALID_CODIGO_TEXT,
  CODIGO_NO_RECONOCIDO_TEXT,
  CONSULTA_ASK_DOCUMENTO_TEXT,
  NO_VERIFICADO_TEXT,
  OTP_BLOQUEADO_TEXT,
  BUSCANDO_INCIDENCIA_TEXT,
  BUSCANDO_INCIDENCIAS_TEXT,
  incidenciaCodigoLineText,
  incidenciaEstadoLineText,
  incidenciaFechaLineText,
  NO_UBICADA_TEXT,
  SIN_INCIDENCIAS_TEXT,
  INCIDENCIAS_LIST_TEXT,
  CONSULTA_FALLA_TEXT,
  LISTAR_BUTTONS,
} from "@/lib/constants/textos/consulta";
import { ASK_OTP_TEXT, VALIDANDO_DOCUMENTO_TEXT, VERIFICANDO_CODIGO_TEXT, codigoIncorrectoText } from "@/lib/constants/textos/identidad";
import { INVALID_DOCUMENT_TEXT } from "@/lib/constants/textos/fallas";
import { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { slotText } from "@/lib/fsm/core/slot-readers";
import { isString } from "@/lib/utils/type-guards";
import { readSlotJson, slotJsonOr } from "@/lib/fsm/core/slot-readers";
import { z } from "zod";
import { MAX_INTENTOS_CODIGO, MAX_INTENTOS_OTP } from "@/lib/constants/limits/consulta";
import { WHATSAPP_ROW_TITLE_MAX, WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

const canalDe = (channel: SessionChannel | undefined): string =>
  channel === SessionChannelEnum.WEB ? SessionChannelEnum.WEB : SessionChannelEnum.WHATSAPP;

function closed(state: SessionState.CONSULTA_COMPLETED | SessionState.CONSULTA_FAILED, text: string): HandlerResult {
  return buildResult({ state, slots: {}, counters: {} }, [sendText(text)]);
}

function startSearch(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_QUERY_PENDING;
  const web = next.slots[SlotKey.CONSULTA_CANAL] === SessionChannelEnum.WEB;
  return buildResult(next, [
    sendText(BUSCANDO_INCIDENCIA_TEXT),
    query(QueryKind.CONSULTAR_INCIDENCIA, {
      codigo: slotText(next.slots, SlotKey.CONSULTA_CODIGO),
      canal: web ? SessionChannelEnum.WEB : SessionChannelEnum.WHATSAPP,
      ...(web ? { dni: slotText(next.slots, SlotKey.CONSULTA_DNI) } : {}),
    }),
  ]);
}

function afterIdentityCheck(session: Session, next: SessionState): HandlerResult {
  const web = session.slots[SlotKey.CONSULTA_CANAL] === SessionChannelEnum.WEB;
  if (!web || session.slots[SlotKey.CONSULTA_DNI]) {
    return next === SessionState.CONSULTA_QUERY_PENDING ? startSearch(session) : startListado(session);
  }

  const pending = cloneSession(session);
  pending.state = SessionState.CONSULTA_AWAITING_DNI;
  return buildResult(pending, [sendText(CONSULTA_ASK_DOCUMENTO_TEXT)]);
}

function afterCodigo(session: Session): HandlerResult {
  return afterIdentityCheck(session, SessionState.CONSULTA_QUERY_PENDING);
}

function afterListarChoice(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_LISTANDO] = true;
  return afterIdentityCheck(next, SessionState.CONSULTA_LISTAR_PENDING);
}

function startListado(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_LISTAR_PENDING;
  const web = next.slots[SlotKey.CONSULTA_CANAL] === SessionChannelEnum.WEB;
  return buildResult(next, [
    sendText(BUSCANDO_INCIDENCIAS_TEXT),
    query(QueryKind.LISTAR_INCIDENCIAS, {
      canal: web ? SessionChannelEnum.WEB : SessionChannelEnum.WHATSAPP,
      ...(web ? { dni: slotText(next.slots, SlotKey.CONSULTA_DNI) } : {}),
    }),
  ]);
}

function askCodigoOrListar(session: Session): HandlerResult {
  return buildResult(session, [sendText(ASK_CODIGO_TEXT), sendButtons(ASK_CODIGO_O_LISTAR_TEXT, LISTAR_BUTTONS)]);
}

export function beginConsulta(channel: SessionChannel | undefined, codigo?: string): HandlerResult {
  const session: Session = {
    state: SessionState.CONSULTA_AWAITING_CODIGO,
    slots: { [SlotKey.CONSULTA_CANAL]: canalDe(channel), ...(codigo ? { [SlotKey.CONSULTA_CODIGO]: codigo } : {}) },
    counters: {},
  };
  return codigo ? afterCodigo(session) : askCodigoOrListar(session);
}

function handleAwaitingCodigo(session: Session, event: InboundEvent): HandlerResult {
  const reply = readTappedId(event);
  if (reply === ConsultaCodigoButtonId.LISTAR) return afterListarChoice(session);

  const codigo = event.text ? extractCodigoIncidencia(event.text) : null;
  if (codigo) {
    const next = cloneSession(session);
    next.slots[SlotKey.CONSULTA_CODIGO] = codigo;
    return afterCodigo(next);
  }

  if (!event.text) return askCodigoOrListar(session);

  const next = cloneSession(session);
  const attempts = (next.counters[CounterKey.CONSULTA_INTENTOS_CODIGO] ?? 0) + 1;
  next.counters[CounterKey.CONSULTA_INTENTOS_CODIGO] = attempts;
  if (attempts >= MAX_INTENTOS_CODIGO) return closed(SessionState.CONSULTA_FAILED, CODIGO_NO_RECONOCIDO_TEXT);
  return buildResult(next, [sendText(INVALID_CODIGO_TEXT)]);
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const documento = readTrimmedText(event);
  if (!isValidDocumentoFormat(documento)) return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);

  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_DNI_PENDING] = documento;
  next.state = SessionState.CONSULTA_VALIDATE_PENDING;
  return buildResult(next, [sendText(VALIDANDO_DOCUMENTO_TEXT), validateUserQuery(documento)]);
}

function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status?: string; twofaId?: string };

  if (result.status === ValidateUserStatus.VALID && isString(result.twofaId)) {
    const next = cloneSession(session);
    next.slots[SlotKey.CONSULTA_TWOFA_ID] = result.twofaId;
    next.state = SessionState.CONSULTA_AWAITING_OTP;
    return buildResult(next, [sendText(ASK_OTP_TEXT)]);
  }
  return closed(SessionState.CONSULTA_FAILED, result.status === ValidateUserStatus.NOT_VALID ? NO_VERIFICADO_TEXT : CONSULTA_FALLA_TEXT);
}

function failOtpAttempt(session: Session): HandlerResult {
  const next = cloneSession(session);
  const attempts = (next.counters[CounterKey.CONSULTA_INTENTOS_OTP] ?? 0) + 1;
  next.counters[CounterKey.CONSULTA_INTENTOS_OTP] = attempts;
  if (attempts >= MAX_INTENTOS_OTP) return closed(SessionState.CONSULTA_FAILED, OTP_BLOQUEADO_TEXT);

  next.state = SessionState.CONSULTA_AWAITING_OTP;
  return buildResult(next, [sendText(codigoIncorrectoText(MAX_INTENTOS_OTP - attempts))]);
}

function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = readTrimmedText(event);
  if (!isValidOtpFormat(code)) return failOtpAttempt(session);

  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_VERIFY_PENDING;
  return buildResult(next, [
    sendText(VERIFICANDO_CODIGO_TEXT),
    query(QueryKind.VERIFY_CODE, { twofaId: slotText(next.slots, SlotKey.CONSULTA_TWOFA_ID), code }),
  ]);
}

function handleVerifyPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status?: string; token?: string };
  const next = cloneSession(session);

  if (result.status === VerifyCodeStatus.VERIFIED && isString(result.token)) {
    next.slots[SlotKey.CONSULTA_DNI] = slotText(next.slots, SlotKey.CONSULTA_DNI_PENDING);
    delete next.slots[SlotKey.CONSULTA_DNI_PENDING];
    delete next.slots[SlotKey.CONSULTA_TWOFA_ID];
    delete next.counters[CounterKey.CONSULTA_INTENTOS_OTP];
    const listando = Boolean(next.slots[SlotKey.CONSULTA_LISTANDO]);
    delete next.slots[SlotKey.CONSULTA_LISTANDO];
    return listando ? startListado(next) : startSearch(next);
  }

  if (result.status !== VerifyCodeStatus.INVALID) return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);

  return failOtpAttempt(session);
}

export function foundText(result: Extract<ConsultaIncidenciaResult, { status: LookupStatus.FOUND }>): string {
  const fecha = fechaLegible(result.fechaRegistro);
  return [
    incidenciaCodigoLineText(result.codigo),
    incidenciaEstadoLineText(estadoLegible(result.estado)),
    ...(fecha ? [incidenciaFechaLineText(fecha)] : []),
  ].join("\n");
}

function handleQueryPending(event: QueryResultEvent): HandlerResult {
  const result = event.result as ConsultaIncidenciaResult | undefined;
  if (result?.status === LookupStatus.FOUND) return closed(SessionState.CONSULTA_COMPLETED, foundText(result));
  if (result?.status === LookupStatus.NOT_FOUND) return closed(SessionState.CONSULTA_COMPLETED, NO_UBICADA_TEXT);
  return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
}

type IncidenciaListada = { codigo: string; estado: string; fechaRegistro: string };

const LISTADO_SCHEMA = z.array(z.object({ codigo: z.string(), estado: z.string(), fechaRegistro: z.string() }));

function readListado(session: Session): IncidenciaListada[] {
  return slotJsonOr(readSlotJson(session.slots, SlotKey.CONSULTA_LISTADO_DATA, LISTADO_SCHEMA), []);
}

function listadoRows(items: IncidenciaListada[]): ListRow[] {
  return items.map((item) => ({
    id: item.codigo,
    title: truncateForRow(item.codigo, WHATSAPP_ROW_TITLE_MAX),
    description: truncateForRow(`${estadoLegible(item.estado)} · ${fechaLegible(item.fechaRegistro)}`, WHATSAPP_ROW_DESCRIPTION_MAX),
  }));
}

function handleListarPending(event: QueryResultEvent): HandlerResult {
  const result = event.result as ListarIncidenciasResult | undefined;
  if (result?.status === ReferenceStatus.EMPTY) return closed(SessionState.CONSULTA_COMPLETED, SIN_INCIDENCIAS_TEXT);
  if (result?.status !== ReferenceStatus.FOUND) return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);

  const next: Session = { state: SessionState.CONSULTA_AWAITING_LISTADO, slots: {}, counters: {} };
  next.slots[SlotKey.CONSULTA_LISTADO_DATA] = JSON.stringify(result.items);
  return buildResult(next, offerPagedList(next, INCIDENCIAS_LIST_TEXT, listadoRows(result.items)));
}

function handleAwaitingListado(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if (outcome.kind === SelectionOutcomeKind.HANDLED) return outcome.result;

  const item = readListado(session).find((i) => i.codigo === outcome.replyId);
  if (!item) return closed(SessionState.CONSULTA_COMPLETED, NO_UBICADA_TEXT);
  return closed(SessionState.CONSULTA_COMPLETED, foundText({ status: LookupStatus.FOUND, ...item }));
}

export function handleConsulta(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case SessionState.CONSULTA_AWAITING_CODIGO:
      return handleAwaitingCodigo(session, event as InboundEvent);
    case SessionState.CONSULTA_AWAITING_DNI:
      return handleAwaitingDni(session, event as InboundEvent);
    case SessionState.CONSULTA_VALIDATE_PENDING:
      return handleValidatePending(session, event as QueryResultEvent);
    case SessionState.CONSULTA_AWAITING_OTP:
      return handleAwaitingOtp(session, event as InboundEvent);
    case SessionState.CONSULTA_VERIFY_PENDING:
      return handleVerifyPending(session, event as QueryResultEvent);
    case SessionState.CONSULTA_QUERY_PENDING:
      return handleQueryPending(event as QueryResultEvent);
    case SessionState.CONSULTA_LISTAR_PENDING:
      return handleListarPending(event as QueryResultEvent);
    case SessionState.CONSULTA_AWAITING_LISTADO:
      return handleAwaitingListado(session, event as InboundEvent);
    default:
      throw new UnknownStateError("handleConsulta", session.state);
  }
}
