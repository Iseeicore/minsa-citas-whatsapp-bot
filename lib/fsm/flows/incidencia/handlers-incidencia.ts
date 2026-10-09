import { INVALID_DNI_TEXT } from "@/lib/fsm/core/failure-texts";
import { enterDescripcion, handleAwaitingBorradorExtra, handleConfirmBorrador } from "@/lib/fsm/flows/incidencia/borrador";
import {
  afterDescripcion,
  EVIDENCIA_ACK_TEXT,
  FOTO_REQUEST_TEXT,
  submitIncidencia,
  UNREADABLE_TEXT_RETRY,
} from "@/lib/fsm/flows/incidencia/pasos-comunes";
import {
  handleAwaitingUbicacion,
  handleConfirmOmitir,
  handleConfirmUbicacion,
  handleUbicacionPending,
} from "@/lib/fsm/flows/incidencia/ubicacion";
import { isValidDniFormat, isValidDocumentoFormat } from "@/lib/fsm/parsing/text/identity-format";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { MAX_DESCRIPCION_LENGTH, MIN_DESCRIPCION_LENGTH } from "@/lib/recepcion/dto";
import { quiereCerrar } from "@/lib/fsm/parsing/text/cerrar-incidencia";
import { buildResult, cloneSession, query, readReply, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { INCIDENCIA_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const FOTO_INTENT_MAX_LENGTH = 200;
const ASK_DOCUMENTO_TEXT = "Ingresa tu número de documento.";
const RENIEC_FAILED_TEXT = "Disculpa, nuestro servicio no responde. Disculpa las molestias. Escríbenos tu nombre o un alias.";
const ONLY_DNI_TEXT = "Por ahora este canal solo valida el DNI. Escribe tu DNI o continúa de forma anónima.";
const ONLY_DNI_BUTTONS = [{ id: IncidenciaButtonId.ANONIMO, title: "Continuar anónimo" }];

const CANCELLED_TEXT =
  "Entendido, cerramos esta conversación y no se registró ninguna incidencia. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";

const DAILY_LIMIT_TEXT = "Hoy ya registraste el máximo de incidencias permitido. Podrás registrar otra mañana. Gracias por tu comprensión.";

/** «Quiero cerrar» (mensaje completo) cancela desde cualquier paso: no se guarda nada y la conversación termina. */
function cancel(): HandlerResult {
  return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(CANCELLED_TEXT)]);
}

export function handleIncidencia(session: Session, event: HandleEvent): HandlerResult {
  if (event.type === InboundEventType.TEXT && event.text && quiereCerrar(event.text)) return cancel();

  switch (session.state) {
    case SessionState.INCIDENCIA_AWAITING_UBICACION:
      return handleAwaitingUbicacion(session, event as InboundEvent);
    case SessionState.INCIDENCIA_UBICACION_PENDING:
      return handleUbicacionPending(session, event as QueryResultEvent);
    case SessionState.INCIDENCIA_CONFIRM_UBICACION:
      return handleConfirmUbicacion(session, event as InboundEvent);
    case SessionState.INCIDENCIA_CONFIRM_OMITIR:
      return handleConfirmOmitir(session, event as InboundEvent);
    case SessionState.INCIDENCIA_IDENTITY_CHOICE:
      return handleIdentityChoice(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_DNI:
      return handleAwaitingDni(session, event as InboundEvent);
    case SessionState.INCIDENCIA_RENIEC_PENDING:
      return handleReniecPending(session, event as QueryResultEvent);
    case SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE:
      return handleAwaitingNombreLibre(session, event as InboundEvent);
    case SessionState.INCIDENCIA_CONFIRM_BORRADOR:
      return handleConfirmBorrador(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA:
      return handleAwaitingBorradorExtra(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_DESCRIPCION:
      return handleAwaitingDescripcion(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_FOTO:
      return handleAwaitingFoto(session, event as InboundEvent);
    case SessionState.INCIDENCIA_FOTO_INTENT_PENDING:
      return handleFotoIntentPending(session, event as QueryResultEvent);
    case SessionState.INCIDENCIA_SUBMIT_PENDING:
      return handleSubmitPending(session, event as QueryResultEvent);
    default:
      throw new Error(`handleIncidencia: unknown state "${session.state}"`);
  }
}

function handleIdentityChoice(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  const next = cloneSession(session);

  if (replyId === IncidenciaButtonId.CON_NOMBRE) {
    next.state = SessionState.INCIDENCIA_AWAITING_DNI;
    return buildResult(next, [sendText(ASK_DOCUMENTO_TEXT)]);
  }

  if (replyId === IncidenciaButtonId.ANONIMO) return enterDescripcion(next);

  return buildResult(session, [
    sendButtons("¿Deseas registrar tu nombre, o prefieres que sea anónimo?", INCIDENCIA_NOMBRE_BUTTONS),
  ]);
}

/**
 * Por ahora solo se valida el DNI en RENIEC. Un carnet de extranjería (9 dígitos) se reconoce para no decirle «inválido», pero
 * no se acepta: puede escribir un DNI o seguir de forma anónima.
 */
function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  if (readReply(event) === IncidenciaButtonId.ANONIMO) return enterDescripcion(cloneSession(session));

  const documento = (event.text ?? "").trim();

  if (!isValidDniFormat(documento)) {
    if (isValidDocumentoFormat(documento)) return buildResult(session, [sendButtons(ONLY_DNI_TEXT, ONLY_DNI_BUTTONS)]);
    return buildResult(session, [sendText(INVALID_DNI_TEXT)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DNI] = documento;
  next.state = SessionState.INCIDENCIA_RENIEC_PENDING;
  return buildResult(next, [sendText("Verificando tu documento…"), query(QueryKind.RENIEC_LOOKUP, { dni: documento })]);
}

/** El nombre sale de RENIEC. Si no lo encuentra o no responde, se pide un nombre o alias y se sigue sin detener a la persona. */
function handleReniecPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; nombreCompleto?: string };
  const next = cloneSession(session);

  if (result.status === "found" && typeof result.nombreCompleto === "string" && result.nombreCompleto.trim() !== "") {
    next.slots[SlotKey.NOMBRE_COMPLETO] = result.nombreCompleto.trim();
    return withGreeting(enterDescripcion(next), result.nombreCompleto.trim());
  }

  next.state = SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE;
  return buildResult(next, [sendText(RENIEC_FAILED_TEXT)]);
}

function withGreeting(result: HandlerResult, nombre: string): HandlerResult {
  return { ...result, effects: [sendText(`Gracias, ${nombre}.`), ...result.effects] };
}

/** Nombre o alias tal cual lo escribe la persona; no se verifica: es lo que se usa cuando RENIEC no pudo darlo. */
function handleAwaitingNombreLibre(session: Session, event: InboundEvent): HandlerResult {
  const nombre = (event.text ?? "").trim();

  if (!nombre) return buildResult(session, [sendText("Por favor, ingresa tu nombre.")]);
  if (looksLikeNoise(nombre)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);

  const next = cloneSession(session);
  next.slots[SlotKey.NOMBRE_COMPLETO] = nombre;
  return enterDescripcion(next);
}

function handleAwaitingDescripcion(session: Session, event: InboundEvent): HandlerResult {
  const descripcion = (event.text ?? "").trim();

  if (!descripcion || descripcion.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(`Escribe tu incidencia en hasta ${MAX_DESCRIPCION_LENGTH} caracteres.`)]);
  }

  if (looksLikeNoise(descripcion)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);

  if (descripcion.length < MIN_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(`Cuéntanos un poco más: escribe al menos ${MIN_DESCRIPCION_LENGTH} caracteres para poder entender lo que pasó.`)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DESCRIPCION_INCIDENCIA] = descripcion;
  return afterDescripcion(next);
}

function isFile(event: InboundEvent): boolean {
  return event.type === InboundEventType.IMAGE || event.type === InboundEventType.DOCUMENT;
}

/**
 * Pide la evidencia, que es opcional. Si llega un archivo (imagen o PDF) se reconoce pero no se descarga ni se guarda: se acusa
 * recibo y se registra la incidencia. Lo que no es un archivo (sticker, audio) ni siquiera llega aquí.
 */
function handleAwaitingFoto(session: Session, event: InboundEvent): HandlerResult {
  if (isFile(event)) return withAck(submitIncidencia(session, event.from));

  const typed = (event.text ?? "").trim();
  if (!typed) return buildResult(session, [sendText(FOTO_REQUEST_TEXT)]);

  if (typed.toUpperCase() === "OMITIR" || resolveConfirmation(typed) === Confirmation.NO) {
    return submitIncidencia(session, event.from);
  }

  if (
    resolveConfirmation(typed) === Confirmation.YES ||
    typed.length > FOTO_INTENT_MAX_LENGTH ||
    looksLikeNoise(typed)
  ) {
    return buildResult(session, [sendText(FOTO_REQUEST_TEXT)]);
  }

  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_FOTO_INTENT_PENDING;
  return buildResult(next, [query(QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT, { text: typed })]);
}

function withAck(result: HandlerResult): HandlerResult {
  return { ...result, effects: [sendText(EVIDENCIA_ACK_TEXT), ...result.effects] };
}

function handleFotoIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { quiereOmitir?: boolean };
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;

  if (result.quiereOmitir === true) return submitIncidencia(next, event.from);

  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}

/** Con establecimiento se entrega el código de seguimiento; sin él, solo se agradece. */
function confirmationText(session: Session, codigo: string | undefined): string {
  const hasEstablecimiento = session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] !== undefined;
  if (hasEstablecimiento && codigo) return `¡Gracias! Tu incidencia quedó registrada con el código ${codigo}. Guárdalo para darle seguimiento.`;
  return "Gracias por tu reporte de incidencia, ya se registró.";
}

function handleSubmitPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; reason?: string; codigo?: string };
  const next = cloneSession(session);

  if (result.status === "accepted") {
    next.state = SessionState.INCIDENCIA_CONFIRMED;
    return buildResult(next, [sendText(confirmationText(next, result.codigo))]);
  }

  next.state = SessionState.INCIDENCIA_FAILED;
  const message = result.reason === "daily_limit" ? DAILY_LIMIT_TEXT : "No pudimos registrar tu incidencia en este momento. Por favor, intenta de nuevo más tarde.";
  return buildResult(next, [sendText(message)]);
}
