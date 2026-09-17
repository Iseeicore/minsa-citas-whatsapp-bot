import { isValidDniFormat, namesMatch } from "./domain";
import { buildResult, cloneSession, query, readReply, sendButtons, sendText } from "./handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "./types";

const MAX_DESCRIPCION_LENGTH = 1000;

export function handleReclamo(session: Session, event: HandleEvent): HandlerResult {
  switch (session.state) {
    case "reclamo_identity_choice":
      return handleIdentityChoice(session, event as InboundEvent);
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

  if (replyId === "reclamo_con_dni") {
    next.state = "reclamo_awaiting_dni";
    return buildResult(next, [sendText("Ingresa tu DNI (8 dígitos).")]);
  }

  if (replyId === "reclamo_sin_dni") {
    next.state = "reclamo_awaiting_descripcion";
    return buildResult(next, [sendText(askDescripcion())]);
  }

  return buildResult(session, [
    sendButtons("¿Tienes tu DNI a la mano?", [
      { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
      { id: "reclamo_sin_dni", title: "No tengo DNI" },
    ]),
  ]);
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  const dni = (event.text ?? "").trim();

  if (!isValidDniFormat(dni)) {
    return buildResult(session, [
      sendText("DNI inválido. Debe tener 8 dígitos. Intenta de nuevo."),
    ]);
  }

  const next = cloneSession(session);
  next.slots.dni = dni;
  next.state = "reclamo_awaiting_nombre";
  return buildResult(next, [sendText("Ingresa tu nombre (como aparece en tu DNI).")]);
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
    query("reniec_lookup", { dni: next.slots.dni }),
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

  const next = cloneSession(session);
  next.slots.queja = queja;
  next.state = "reclamo_awaiting_foto";
  return buildResult(next, [
    sendText("¿Deseas adjuntar una foto como evidencia? Envíala ahora, o escribe OMITIR."),
  ]);
}

function handleAwaitingFoto(session: Session, event: InboundEvent): HandlerResult {
  const omitted = (event.text ?? "").trim().toUpperCase() === "OMITIR";

  if (!event.mediaId && !omitted) {
    return buildResult(session, [
      sendText("Envía una foto como evidencia, o escribe OMITIR para continuar sin foto."),
    ]);
  }

  const next = cloneSession(session);
  if (event.mediaId) next.slots.mediaId = event.mediaId;
  next.state = "reclamo_submit_pending";

  const submission = {
    celular: event.from,
    dni: (next.slots.dni as string | undefined) ?? null,
    nombreCompleto: (next.slots.nombreCompleto as string | undefined) ?? null,
    queja: next.slots.queja,
    mediaId: (next.slots.mediaId as string | undefined) ?? undefined,
  };

  return buildResult(next, [
    sendText("Enviando tu reclamo…"),
    query("quejas_submit", { submission }),
  ]);
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
