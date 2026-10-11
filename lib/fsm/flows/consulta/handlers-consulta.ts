import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session, SessionChannel } from "@/lib/fsm/core/types";
import { validateUserQuery } from "@/lib/fsm/flows/cita/steps/identity/validate-user-query";
import { extractCodigoIncidencia } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { isValidDocumentoFormat, isValidOtpFormat } from "@/lib/fsm/parsing/text/identity-format";
import { estadoLegible, fechaLegible, type ConsultaIncidenciaResult } from "@/lib/recepcion/consulta-dto";
import { QueryKind } from "@/lib/enums/query-kind";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";
import { SlotKey } from "@/lib/enums/slot-key";
import { CounterKey } from "@/lib/enums/counter-key";
import { SessionState } from "@/lib/enums/session-state";

const MAX_INTENTOS_CODIGO = 3;
const MAX_INTENTOS_OTP = 3;
const CANAL_WEB = "web";
const CANAL_WHATSAPP = "whatsapp";

export const ASK_CODIGO_TEXT = "Escribe el código de tu incidencia (por ejemplo, MINSA-2026-000001).";
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

function afterCodigo(session: Session): HandlerResult {
  const web = session.slots[SlotKey.CONSULTA_CANAL] === CANAL_WEB;
  if (!web || session.slots[SlotKey.CONSULTA_DNI]) return startSearch(session);

  const next = cloneSession(session);
  next.state = SessionState.CONSULTA_AWAITING_DNI;
  return buildResult(next, [sendText(ASK_DOCUMENTO_TEXT)]);
}

/** Entrada a la consulta; con `codigo` ya reconocido en el mensaje salta directo a la búsqueda (o a verificar la identidad en la web). */
export function beginConsulta(channel: SessionChannel | undefined, codigo?: string): HandlerResult {
  const session: Session = {
    state: SessionState.CONSULTA_AWAITING_CODIGO,
    slots: { [SlotKey.CONSULTA_CANAL]: canalDe(channel), ...(codigo ? { [SlotKey.CONSULTA_CODIGO]: codigo } : {}) },
    counters: {},
  };
  return codigo ? afterCodigo(session) : buildResult(session, [sendText(ASK_CODIGO_TEXT)]);
}

function handleAwaitingCodigo(session: Session, event: InboundEvent): HandlerResult {
  const codigo = event.text ? extractCodigoIncidencia(event.text) : null;
  if (codigo) {
    const next = cloneSession(session);
    next.slots[SlotKey.CONSULTA_CODIGO] = codigo;
    return afterCodigo(next);
  }

  if (!event.text) return buildResult(session, [sendText(ASK_CODIGO_TEXT)]);

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
    return startSearch(next);
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
    default:
      throw new Error(`handleConsulta: unknown state "${session.state}"`);
  }
}
