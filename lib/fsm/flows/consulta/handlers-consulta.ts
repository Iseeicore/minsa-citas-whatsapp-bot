import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import {
  buildResult,
  cloneSession,
  offerPagedList,
  query,
  sendButtons,
  sendText,
  truncateForRow,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_TITLE_MAX,
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
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const MAX_INTENTOS_CODIGO = 3;
const MAX_INTENTOS_OTP = 3;
const CANAL_WEB = "web";
const CANAL_WHATSAPP = "whatsapp";
const LISTAR_ID = ConsultaCodigoButtonId.LISTAR;

export const ASK_CODIGO_TEXT = "Escribe el código de tu incidencia (por ejemplo, MINSA-2026-000001).";
export const ASK_CODIGO_O_LISTAR_TEXT = "¿Tienes el código, o prefieres ver todas tus incidencias registradas?";
export const INVALID_CODIGO_TEXT = "El código no tiene el formato correcto. Debe verse así: MINSA-2026-000001. Intenta de nuevo.";
export const CODIGO_NO_RECONOCIDO_TEXT = "No pudimos reconocer el código. Revísalo e inicia la consulta nuevamente.";
export const ASK_DOCUMENTO_TEXT = "Para consultar tu incidencia necesito verificar tu identidad. Ingresa tu número de documento.";
export const ASK_OTP_TEXT = "Te enviamos un código a tu teléfono registrado. Escríbelo aquí (4-8 dígitos).";
export const INVALID_OTP_TEXT = "Código inválido. Debe tener entre 4 y 8 dígitos.";
export const NO_VERIFICADO_TEXT = "No pudimos verificar tu identidad. Revisa tu número de documento o inténtalo más tarde.";
export const OTP_BLOQUEADO_TEXT = "Superaste el número de intentos permitidos. Inténtalo nuevamente más tarde.";
/** Una incidencia inexistente, ajena, anónima (en la web) o borrada recibe EXACTAMENTE este texto: no se distingue entre ellas. */
export const NO_UBICADA_TEXT = "No se logró ubicar el registro de la incidencia.";
export const CONSULTA_FALLA_TEXT = "Disculpa, no podemos consultar tu incidencia en este momento. Inténtalo más tarde.";
export const SIN_INCIDENCIAS_TEXT = "No tienes incidencias registradas.";

/**
 * Punto de extensión para la identidad en la web: hoy se verifica con DNI + código OTP de MINSA Digital (los mismos pasos que el
 * flujo de citas). Cuando el portal entregue la especificación de su JWT (firma, emisor, vencimiento y campo del documento),
 * esta es la única parte a cambiar: validar el token y dejar el documento verificado en `CONSULTA_DNI`.
 */
const canalDe = (channel: SessionChannel | undefined): string => (channel === SessionChannelEnum.WEB ? CANAL_WEB : CANAL_WHATSAPP);

function closed(state: SessionState.CONSULTA_COMPLETED | SessionState.CONSULTA_FAILED, text: string): HandlerResult {
  return buildResult({ state, slots: {}, counters: {} }, [sendText(text)]);
}

function startSearch(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_QUERY_PENDING;
  const web = next.slots[SlotKey.CONSULTA_CANAL] === CANAL_WEB;
  return buildResult(next, [
    sendText("Buscando tu incidencia…"),
    query(QueryKind.CONSULTAR_INCIDENCIA, {
      codigo: String(next.slots[SlotKey.CONSULTA_CODIGO] ?? ""),
      canal: web ? CANAL_WEB : CANAL_WHATSAPP,
      ...(web ? { dni: String(next.slots[SlotKey.CONSULTA_DNI] ?? "") } : {}),
    }),
  ]);
}

/** Pide DNI+OTP antes de avanzar solo en la web; en WhatsApp sigue directo, como ya era antes de requerirlo también ahí. */
function afterIdentityCheck(session: Session, next: SessionState): HandlerResult {
  const web = session.slots[SlotKey.CONSULTA_CANAL] === CANAL_WEB;
  if (!web || session.slots[SlotKey.CONSULTA_DNI]) {
    return next === SessionState.CONSULTA_QUERY_PENDING ? startSearch(session) : startListado(session);
  }

  const pending = cloneSession(session);
  pending.state = SessionState.CONSULTA_AWAITING_DNI;
  return buildResult(pending, [sendText(ASK_DOCUMENTO_TEXT)]);
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
  const web = next.slots[SlotKey.CONSULTA_CANAL] === CANAL_WEB;
  return buildResult(next, [
    sendText("Buscando tus incidencias…"),
    query(QueryKind.LISTAR_INCIDENCIAS, {
      canal: web ? CANAL_WEB : CANAL_WHATSAPP,
      ...(web ? { dni: String(next.slots[SlotKey.CONSULTA_DNI] ?? "") } : {}),
    }),
  ]);
}

function askCodigoOrListar(session: Session): HandlerResult {
  return buildResult(session, [
    sendText(ASK_CODIGO_TEXT),
    sendButtons(ASK_CODIGO_O_LISTAR_TEXT, [{ id: LISTAR_ID, title: "Ver todas mis incidencias" }]),
  ]);
}

/** Entrada a la consulta; con `codigo` ya reconocido en el mensaje salta directo a la búsqueda (o a verificar la identidad en la web). */
export function beginConsulta(channel: SessionChannel | undefined, codigo?: string): HandlerResult {
  const session: Session = {
    state: SessionState.CONSULTA_AWAITING_CODIGO,
    slots: { [SlotKey.CONSULTA_CANAL]: canalDe(channel), ...(codigo ? { [SlotKey.CONSULTA_CODIGO]: codigo } : {}) },
    counters: {},
  };
  return codigo ? afterCodigo(session) : askCodigoOrListar(session);
}

function handleAwaitingCodigo(session: Session, event: InboundEvent): HandlerResult {
  const reply = event.type === InboundEventType.BUTTON || event.type === InboundEventType.LIST ? event.listId : undefined;
  if (reply === LISTAR_ID) return afterListarChoice(session);

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
  const documento = (event.text ?? "").trim();
  if (!isValidDocumentoFormat(documento)) return buildResult(session, [sendText(INVALID_DOCUMENT_TEXT)]);

  const next = cloneSession(session);
  next.slots[SlotKey.CONSULTA_DNI_PENDING] = documento;
  next.state = SessionState.CONSULTA_VALIDATE_PENDING;
  return buildResult(next, [sendText("Validando tu documento…"), validateUserQuery(documento)]);
}

function handleValidatePending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status?: string; twofaId?: string };

  if (result.status === "valid" && typeof result.twofaId === "string") {
    const next = cloneSession(session);
    next.slots[SlotKey.CONSULTA_TWOFA_ID] = result.twofaId;
    next.state = SessionState.CONSULTA_AWAITING_OTP;
    return buildResult(next, [sendText(ASK_OTP_TEXT)]);
  }
  return closed(SessionState.CONSULTA_FAILED, result.status === "not_valid" ? NO_VERIFICADO_TEXT : CONSULTA_FALLA_TEXT);
}

function handleAwaitingOtp(session: Session, event: InboundEvent): HandlerResult {
  const code = (event.text ?? "").trim();
  if (!isValidOtpFormat(code)) return buildResult(session, [sendText(INVALID_OTP_TEXT)]);

  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_VERIFY_PENDING;
  return buildResult(next, [
    sendText("Verificando código…"),
    query(QueryKind.VERIFY_CODE, { twofaId: String(next.slots[SlotKey.CONSULTA_TWOFA_ID] ?? ""), code }),
  ]);
}

function handleVerifyPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status?: string; token?: string };
  const next = cloneSession(session);

  if (result.status === "verified" && typeof result.token === "string") {
    next.slots[SlotKey.CONSULTA_DNI] = String(next.slots[SlotKey.CONSULTA_DNI_PENDING] ?? "");
    delete next.slots[SlotKey.CONSULTA_DNI_PENDING];
    delete next.slots[SlotKey.CONSULTA_TWOFA_ID];
    delete next.counters[CounterKey.CONSULTA_INTENTOS_OTP];
    const listando = Boolean(next.slots[SlotKey.CONSULTA_LISTANDO]);
    delete next.slots[SlotKey.CONSULTA_LISTANDO];
    return listando ? startListado(next) : startSearch(next);
  }

  if (result.status !== "invalid") return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);

  const attempts = (next.counters[CounterKey.CONSULTA_INTENTOS_OTP] ?? 0) + 1;
  next.counters[CounterKey.CONSULTA_INTENTOS_OTP] = attempts;
  if (attempts >= MAX_INTENTOS_OTP) return closed(SessionState.CONSULTA_FAILED, OTP_BLOQUEADO_TEXT);

  next.state = SessionState.CONSULTA_AWAITING_OTP;
  return buildResult(next, [sendText(`Código incorrecto. Te quedan ${MAX_INTENTOS_OTP - attempts} intento(s).`)]);
}

/** Solo código, estado y fecha de registro: nunca la descripción ni datos de quien reportó. */
export function foundText(result: Extract<ConsultaIncidenciaResult, { status: "found" }>): string {
  const fecha = fechaLegible(result.fechaRegistro);
  return [`Incidencia ${result.codigo}`, `Estado: ${estadoLegible(result.estado)}`, ...(fecha ? [`Fecha de registro: ${fecha}`] : [])].join("\n");
}

function handleQueryPending(event: QueryResultEvent): HandlerResult {
  const result = event.result as ConsultaIncidenciaResult | undefined;
  if (result?.status === "found") return closed(SessionState.CONSULTA_COMPLETED, foundText(result));
  if (result?.status === "not_found") return closed(SessionState.CONSULTA_COMPLETED, NO_UBICADA_TEXT);
  return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);
}

type IncidenciaListada = { codigo: string; estado: string; fechaRegistro: string };

function readListado(session: Session): IncidenciaListada[] {
  const raw = session.slots[SlotKey.CONSULTA_LISTADO_DATA];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as IncidenciaListada[]) : [];
  } catch {
    return [];
  }
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
  if (result?.status === "empty") return closed(SessionState.CONSULTA_COMPLETED, SIN_INCIDENCIAS_TEXT);
  if (result?.status !== "found") return closed(SessionState.CONSULTA_FAILED, CONSULTA_FALLA_TEXT);

  const next: Session = { state: SessionState.CONSULTA_AWAITING_LISTADO, slots: {}, counters: {} };
  next.slots[SlotKey.CONSULTA_LISTADO_DATA] = JSON.stringify(result.items);
  return buildResult(next, offerPagedList(next, "Estas son tus incidencias:", listadoRows(result.items)));
}

function handleAwaitingListado(session: Session, event: InboundEvent): HandlerResult {
  const outcome = resolveSelection(session, event);
  if ("result" in outcome) return outcome.result;

  const item = readListado(session).find((i) => i.codigo === outcome.replyId);
  if (!item) return closed(SessionState.CONSULTA_COMPLETED, NO_UBICADA_TEXT);
  return closed(SessionState.CONSULTA_COMPLETED, foundText({ status: "found", ...item }));
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
      throw new Error(`handleConsulta: unknown state "${session.state}"`);
  }
}
