import { INVALID_DOCUMENT_TEXT } from "@/lib/fsm/core/failure-texts";
import { isValidDniFormat } from "@/lib/fsm/parsing/text/identity-format";
import { namesMatch } from "@/lib/fsm/parsing/text/text";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { buildResult, cloneSession, query, readReply, sendButtons, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { RECLAMO_NOMBRE_BUTTONS } from "@/lib/fsm/routing/flow-entry";
import { ReclamoButtonId } from "@/lib/enums/reclamo-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { QueryKind } from "@/lib/enums/query-kind";

const MAX_DESCRIPCION_LENGTH = 1000;
const FOTO_REQUEST_TEXT =
  "Para poder registrar tu reclamo necesitamos una imagen. ¿Deseas compartírnosla? Envíala ahora, o cuéntanos si prefieres continuar sin foto (también podés escribir OMITIR).";
const FOTO_INTENT_MAX_LENGTH = 200;
const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export function handleReclamo(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case "reclamo_identity_choice":
      return handleIdentityChoice(session, event as InboundEvent);
    case "reclamo_awaiting_nombre_libre":
      return handleAwaitingNombreLibre(session, event as InboundEvent);
    // Dormido a propósito desde 2026-10-01: ya no se entra acá (ver nota en Obsidian para revertir).
    case "reclamo_awaiting_dni":
      return handleAwaitingDni(session, event as InboundEvent);
    case "reclamo_awaiting_nombre":
      return handleAwaitingNombre(session, event as InboundEvent);
    case "reclamo_reniec_pending":
      return handleReniecPending(session, event as QueryResultEvent);
    case "reclamo_awaiting_descripcion":
      return handleAwaitingDescripcion(session, event as InboundEvent);
    case "reclamo_awaiting_foto":
      return handleAwaitingFoto(session, event as InboundEvent);
    case "reclamo_foto_intent_pending":
      return handleFotoIntentPending(session, event as QueryResultEvent);
    case "reclamo_submit_pending":
      return handleSubmitPending(session, event as QueryResultEvent);
    default:
      throw new Error(`handleReclamo: unknown state "${session.state}"`);
  }
}

function askDescripcion(): string {
  return "Cuéntanos tu reclamo (hasta 1000 caracteres).";
}

function handleIdentityChoice(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readReply(event);
  const next = cloneSession(session);

  if (replyId === ReclamoButtonId.CON_NOMBRE) {
    next.state = "reclamo_awaiting_nombre_libre";
    return buildResult(next, [sendText("Ingresa tu nombre.")]);
  }

  if (replyId === ReclamoButtonId.ANONIMO) {
    next.state = "reclamo_awaiting_descripcion";
    return buildResult(next, [sendText(askDescripcion())]);
  }

  return buildResult(session, [
    sendButtons("¿Deseas registrar tu nombre, o prefieres que sea anónimo?", RECLAMO_NOMBRE_BUTTONS),
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
  next.slots.nombreCompleto = nombre;
  next.state = "reclamo_awaiting_descripcion";
  return buildResult(next, [sendText(askDescripcion())]);
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const dni = (event.text ?? "").trim();

  if (!isValidDniFormat(dni)) {
    return buildResult(session, [
      sendText(INVALID_DOCUMENT_TEXT),
    ]);
  }

  const next = cloneSession(session);
  next.slots.dni = dni;
  next.state = "reclamo_awaiting_nombre";
  return buildResult(next, [sendText("Ingresa tu nombre (como aparece en tu documento de identidad).")]);
}

function handleAwaitingNombre(session: Session, event: InboundEvent): HandlerResult {
  const nombre = (event.text ?? "").trim();

  if (!nombre) {
    return buildResult(session, [sendText("Por favor, ingresa tu nombre.")]);
  }

  const next = cloneSession(session);
  next.slots.nombre = nombre;
  next.state = "reclamo_reniec_pending";
  return buildResult(next, [
    sendText("Verificando tu identidad en RENIEC…"),
    query(QueryKind.RENIEC_LOOKUP, { dni: next.slots.dni }),
  ]);
}

function handleReniecPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; nombreCompleto?: string };
  const next = cloneSession(session);

  const matched =
    result.status === "found" &&
    typeof result.nombreCompleto === "string" &&
    namesMatch(String(next.slots.nombre ?? ""), result.nombreCompleto);

  if (matched) {
    next.slots.nombreCompleto = result.nombreCompleto as string;
    next.state = "reclamo_awaiting_descripcion";
    return buildResult(next, [sendText(askDescripcion())]);
  }

  next.state = "reclamo_rejected";
  return buildResult(next, [
    sendText(
      "No pudimos verificar tu identidad con los datos ingresados. Por favor, comunícate directamente con el establecimiento de salud.",
    ),
  ]);
}

function handleAwaitingDescripcion(session: Session, event: InboundEvent): HandlerResult {
  const queja = (event.text ?? "").trim();

  if (!queja || queja.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [
      sendText(`Escribe tu reclamo en hasta ${MAX_DESCRIPCION_LENGTH} caracteres.`),
    ]);
  }

  if (looksLikeNoise(queja)) {
    return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  }

  const next = cloneSession(session);
  next.slots.queja = queja;
  next.state = "reclamo_awaiting_foto";
  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}

function submitReclamo(session: Session, from: string, mediaDataUri?: string): HandlerResult {
  const next = cloneSession(session);
  if (mediaDataUri) next.slots.mediaDataUri = mediaDataUri;
  next.state = "reclamo_submit_pending";

  const submission = {
    celular: from,
    dni: (next.slots.dni as string | undefined) ?? null,
    nombreCompleto: (next.slots.nombreCompleto as string | undefined) ?? null,
    queja: next.slots.queja,
    mediaDataUri: (next.slots.mediaDataUri as string | undefined) ?? undefined,
  };

  return buildResult(next, [
    sendText("Enviando tu reclamo…"),
    query(QueryKind.QUEJAS_SUBMIT, { submission }),
  ]);
}

function handleAwaitingFoto(session: Session, event: InboundEvent): HandlerResult {
  if (event.mediaDataUri) return submitReclamo(session, event.from, event.mediaDataUri);

  const typed = (event.text ?? "").trim();
  if (!typed) return buildResult(session, [sendText(FOTO_REQUEST_TEXT)]);

  if (typed.toUpperCase() === "OMITIR" || resolveConfirmation(typed) === Confirmation.NO) {
    return submitReclamo(session, event.from);
  }

  if (
    resolveConfirmation(typed) === Confirmation.YES ||
    typed.length > FOTO_INTENT_MAX_LENGTH ||
    looksLikeNoise(typed)
  ) {
    return buildResult(session, [sendText(FOTO_REQUEST_TEXT)]);
  }

  const next = cloneSession(session);
  next.state = "reclamo_foto_intent_pending";
  return buildResult(next, [query(QueryKind.ANALYZE_RECLAMO_FOTO_INTENT, { text: typed })]);
}

function handleFotoIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { quiereOmitir?: boolean };
  const next = cloneSession(session);
  next.state = "reclamo_awaiting_foto";

  if (result.quiereOmitir === true) return submitReclamo(next, event.from);

  return buildResult(next, [sendText(FOTO_REQUEST_TEXT)]);
}

function handleSubmitPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; reason?: string };
  const next = cloneSession(session);

  if (result.status === "accepted") {
    next.state = "reclamo_confirmed";
    return buildResult(next, [
      sendText("¡Listo! Tu reclamo fue registrado. Nos pondremos en contacto contigo pronto."),
    ]);
  }

  next.state = "reclamo_failed";
  const message =
    result.reason === "media_too_large"
      ? "No pudimos registrar tu reclamo: la foto adjunta es demasiado pesada. Intenta de nuevo sin foto o con una imagen más liviana."
      : "No pudimos registrar tu reclamo en este momento. Por favor, intenta de nuevo más tarde.";

  return buildResult(next, [sendText(message)]);
}
