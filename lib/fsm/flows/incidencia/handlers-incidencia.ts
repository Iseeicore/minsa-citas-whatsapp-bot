import { INVALID_DNI_TEXT } from "@/lib/fsm/core/failure-texts";
import { isValidDniFormat } from "@/lib/fsm/parsing/text/identity-format";
import { namesMatch } from "@/lib/fsm/parsing/text/text";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { MAX_DESCRIPCION_LENGTH } from "@/lib/recepcion/dto";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { buildResult, cloneSession, query, readReply, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { INCIDENCIA_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const FOTO_REQUEST_TEXT =
  "Para poder registrar tu incidencia necesitamos una imagen. ¿Deseas compartírnosla? Envíala ahora, o cuéntanos si prefieres continuar sin foto (también podés escribir OMITIR).";
const FOTO_INTENT_MAX_LENGTH = 200;
const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export function handleIncidencia(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case SessionState.INCIDENCIA_IDENTITY_CHOICE:
      return handleIdentityChoice(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE:
      return handleAwaitingNombreLibre(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_DNI:
      return handleAwaitingDni(session, event as InboundEvent);
    case SessionState.INCIDENCIA_AWAITING_NOMBRE:
      return handleAwaitingNombre(session, event as InboundEvent);
    case SessionState.INCIDENCIA_RENIEC_PENDING:
      return handleReniecPending(session, event as QueryResultEvent);
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

function askDescripcion(): string {
  return "Cuéntanos tu incidencia (hasta 1000 caracteres).";
}

function handleIdentityChoice(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  const next = cloneSession(session);

  if (replyId === IncidenciaButtonId.CON_NOMBRE) {
    next.state = SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE;
    return buildResult(next, [sendText("Ingresa tu nombre.")]);
  }

  if (replyId === IncidenciaButtonId.ANONIMO) {
    next.state = SessionState.INCIDENCIA_AWAITING_DESCRIPCION;
    return buildResult(next, [sendText(askDescripcion())]);
  }

  return buildResult(session, [
    sendButtons("¿Deseas registrar tu nombre, o prefieres que sea anónimo?", INCIDENCIA_NOMBRE_BUTTONS),
  ]);
}

/** Nombre tal cual lo escribe el usuario, sin verificar contra RENIEC: ya no se pide DNI, no hay contra qué verificarlo. */
function handleAwaitingNombreLibre(session: Session, event: InboundEvent): HandlerResult {
  const nombre = (event.text ?? "").trim();

  if (!nombre) {
    return buildResult(session, [sendText("Por favor, ingresa tu nombre.")]);
  }

  if (looksLikeNoise(nombre)) {
    return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.NOMBRE_COMPLETO] = nombre;
  next.state = SessionState.INCIDENCIA_AWAITING_DESCRIPCION;
  return buildResult(next, [sendText(askDescripcion())]);
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const dni = (event.text ?? "").trim();

  if (!isValidDniFormat(dni)) {
    return buildResult(session, [
      sendText(INVALID_DNI_TEXT),
    ]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DNI] = dni;
  next.state = SessionState.INCIDENCIA_AWAITING_NOMBRE;
  return buildResult(next, [sendText("Ingresa tu nombre (como aparece en tu documento de identidad).")]);
}

function handleAwaitingNombre(session: Session, event: InboundEvent): HandlerResult {
  const nombre = (event.text ?? "").trim();

  if (!nombre) {
    return buildResult(session, [sendText("Por favor, ingresa tu nombre.")]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.NOMBRE] = nombre;
  next.state = SessionState.INCIDENCIA_RENIEC_PENDING;
  return buildResult(next, [
    sendText("Verificando tu identidad en RENIEC…"),
    query(QueryKind.RENIEC_LOOKUP, { dni: next.slots[SlotKey.DNI] }),
  ]);
}

function handleReniecPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; nombreCompleto?: string };
  const next = cloneSession(session);

  const matched =
    result.status === "found" &&
    typeof result.nombreCompleto === "string" &&
    namesMatch(String(next.slots[SlotKey.NOMBRE] ?? ""), result.nombreCompleto);

  if (matched) {
    next.slots[SlotKey.NOMBRE_COMPLETO] = result.nombreCompleto as string;
    next.state = SessionState.INCIDENCIA_AWAITING_DESCRIPCION;
    return buildResult(next, [sendText(askDescripcion())]);
  }

  next.state = SessionState.INCIDENCIA_REJECTED;
  return buildResult(next, [
    sendText(
      "No pudimos verificar tu identidad con los datos ingresados. Por favor, comunícate directamente con el establecimiento de salud.",
    ),
  ]);
}

function handleAwaitingDescripcion(session: Session, event: InboundEvent): HandlerResult {
  const descripcion = (event.text ?? "").trim();

  if (!descripcion || descripcion.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [
      sendText(`Escribe tu incidencia en hasta ${MAX_DESCRIPCION_LENGTH} caracteres.`),
    ]);
  }

  if (looksLikeNoise(descripcion)) {
    return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DESCRIPCION_INCIDENCIA] = descripcion;
  if (!isMediaStorageConfigured()) return submitIncidencia(next, event.from);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;
  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}

function submitIncidencia(session: Session, from: string, mediaDataUri?: string): HandlerResult {
  const next = cloneSession(session);
  if (mediaDataUri) next.slots[SlotKey.MEDIA_DATA_URI] = mediaDataUri;
  next.state = SessionState.INCIDENCIA_SUBMIT_PENDING;

  const submission = {
    waId: from,
    dni: next.slots[SlotKey.DNI] ?? null,
    nombreCompleto: next.slots[SlotKey.NOMBRE_COMPLETO] ?? null,
    descripcion: next.slots[SlotKey.DESCRIPCION_INCIDENCIA],
    mediaDataUri: next.slots[SlotKey.MEDIA_DATA_URI] ?? undefined,
  };

  return buildResult(next, [
    sendText("Enviando tu incidencia…"),
    query(QueryKind.INCIDENCIA_REGISTER, { submission }),
  ]);
}

function handleAwaitingFoto(session: Session, event: InboundEvent): HandlerResult {
  if (event.mediaDataUri) return submitIncidencia(session, event.from, event.mediaDataUri);

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

function handleFotoIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { quiereOmitir?: boolean };
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;

  if (result.quiereOmitir === true) return submitIncidencia(next, event.from);

  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}

function handleSubmitPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; reason?: string };
  const next = cloneSession(session);
  delete next.slots[SlotKey.MEDIA_DATA_URI];

  if (result.status === "accepted") {
    next.state = SessionState.INCIDENCIA_CONFIRMED;
    return buildResult(next, [
      sendText("¡Listo! Tu incidencia fue registrada. Nos pondremos en contacto contigo pronto."),
    ]);
  }

  next.state = SessionState.INCIDENCIA_FAILED;
  const message =
    result.reason === "media_too_large"
      ? "No pudimos registrar tu incidencia: la foto adjunta es demasiado pesada. Intenta de nuevo sin foto o con una imagen más liviana."
      : "No pudimos registrar tu incidencia en este momento. Por favor, intenta de nuevo más tarde.";

  return buildResult(next, [sendText(message)]);
}
