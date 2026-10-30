import { enterDescripcion, handleAwaitingBorradorExtra, handleConfirmBorrador } from "@/lib/fsm/flows/incidencia/borrador";
import { handleConsentCheckPending, handleConsentimiento, handleConsentRegisterPending } from "@/lib/fsm/flows/incidencia/consentimiento";
import {
  afterDescripcion,
  askConfirmRegistro,
  askDescripcion,
  askFoto,
  handleConfirmRegistro,
  maxImagenLegibleText,
} from "@/lib/fsm/flows/incidencia/pasos-comunes";
import { slotText } from "@/lib/fsm/core/slot-readers";
import {
  handleAwaitingUbicacion,
  handleConfirmOmitir,
  handleConfirmUbicacion,
  handleUbicacionPending,
} from "@/lib/fsm/flows/incidencia/ubicacion";
import { isValidDocumentoFormat } from "@/lib/fsm/parsing/text/identity-format";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { quiereCerrar } from "@/lib/fsm/parsing/text/cerrar-incidencia";
import {
  buildResult,
  cloneSession,
  query,
  readTappedId,
  sendButtons,
  sendText,
  withRejectionNotice,
  readTrimmedText,
} from "@/lib/fsm/core/handlers-shared";
import type { HandleEvent, HandlerResult, InboundEvent, InboundMedia, QueryResultEvent, Session } from "@/lib/fsm/core/types";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { Confirmation } from "@/lib/enums/confirmation";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { UnknownStateError } from "@/lib/errors/unknown-state-error";
import { ASK_DOCUMENTO_TEXT } from "@/lib/constants/textos/identidad";
import {
  IDENTITY_QUESTION_TEXT,
  INCIDENCIA_IDENTIDAD_BUTTONS,
  CONTINUAR_ANONIMO_BUTTONS,
  UNREADABLE_TEXT_RETRY,
  documentoNoGuardadoText,
  FOTO_BUTTONS,
  FOTO_LISTO_BUTTONS,
  LISTO_KEYWORD,
  SEGUIR_CON_IMAGENES_TEXT,
  SEGUIR_SIN_IMAGENES_TEXT,
  imagenesRecibidasText,
  DAILY_LIMIT_TEXT,
  REGISTRO_FALLIDO_TEXT,
  descripcionTooLongText,
  descripcionTooShortText,
  OMITIR_KEYWORD,
  incidenciaRegistradaText,
  INCIDENCIA_CANCELADA_TEXT,
  imagenMuyPesadaText,
} from "@/lib/constants/textos/incidencia";
import { INVALID_DOCUMENT_TEXT } from "@/lib/constants/textos/fallas";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import type { RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import {
  MAX_DESCRIPCION_LENGTH,
  MAX_IMAGENES_POR_INCIDENCIA,
  MIN_DESCRIPCION_LENGTH,
  FOTO_INTENT_MAX_LENGTH,
} from "@/lib/constants/limits/incidencia";
import { esImagenRechazada, validarImagen } from "@/lib/recepcion/imagenes/validacion";
import { MediaFailure } from "@/lib/enums/media-failure";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { EvidenceRejection } from "@/lib/enums/evidence-rejection";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { readImagenes, writeImagenes } from "@/lib/fsm/flows/incidencia/imagenes";

const MOTIVO_DE_FALLA_DE_DESCARGA: Readonly<Record<MediaFailure, EvidenceRejection>> = {
  [MediaFailure.TOO_LARGE]: EvidenceRejection.TOO_LARGE,
  [MediaFailure.UNREADABLE]: EvidenceRejection.NOT_DOWNLOADED,
  [MediaFailure.OVER_LIMIT]: EvidenceRejection.OVER_LIMIT,
};

function cancel(): HandlerResult {
  return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(INCIDENCIA_CANCELADA_TEXT)]);
}

const toMotivoDeImagenInvalida = (failure: ImageValidationFailure): EvidenceRejection =>
  failure === ImageValidationFailure.TOO_LARGE ? EvidenceRejection.TOO_LARGE : EvidenceRejection.INVALID;

function buildImagenUnica(event: InboundEvent): InboundMedia {
  if (event.mediaDataUri) return { kind: InboundMediaKind.DATA, dataUri: event.mediaDataUri };
  return { kind: InboundMediaKind.FAILURE, failure: event.mediaFailure ?? MediaFailure.UNREADABLE };
}

function findMotivoDeRechazo(imagen: InboundMedia, aceptadas: string[]): EvidenceRejection | undefined {
  if (aceptadas.length >= MAX_IMAGENES_POR_INCIDENCIA) return EvidenceRejection.OVER_LIMIT;
  if (imagen.kind === InboundMediaKind.FAILURE) return MOTIVO_DE_FALLA_DE_DESCARGA[imagen.failure];

  const validada = validarImagen(imagen.dataUri);
  if (esImagenRechazada(validada)) return toMotivoDeImagenInvalida(validada.failure);
  return aceptadas.includes(imagen.dataUri) ? EvidenceRejection.DUPLICATE : undefined;
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
    case SessionState.INCIDENCIA_CONSENT_CHECK_PENDING:
      return handleConsentCheckPending(session, event as QueryResultEvent);
    case SessionState.INCIDENCIA_CONSENT_CHOICE:
      return handleConsentimiento(session, event as InboundEvent);
    case SessionState.INCIDENCIA_CONSENT_REGISTER_PENDING:
      return handleConsentRegisterPending(session);
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
    case SessionState.INCIDENCIA_CONFIRM_REGISTRO:
      return handleConfirmRegistro(session, event as InboundEvent);
    case SessionState.INCIDENCIA_SUBMIT_PENDING:
      return handleSubmitPending(session, event as QueryResultEvent);
    default:
      throw new UnknownStateError("handleIncidencia", session.state);
  }
}

function handleIdentityChoice(session: Session, event: InboundEvent): HandlerResult {
  const replyId = readTappedId(event);
  const next = cloneSession(session);

  if (replyId === IncidenciaButtonId.CON_DOCUMENTO) {
    next.state = SessionState.INCIDENCIA_AWAITING_DNI;
    return buildResult(next, [sendText(ASK_DOCUMENTO_TEXT)]);
  }

  if (replyId === IncidenciaButtonId.ANONIMO) return enterDescripcion(next);

  return withRejectionNotice(buildResult(session, [sendButtons(IDENTITY_QUESTION_TEXT, INCIDENCIA_IDENTIDAD_BUTTONS)]));
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  if (readTappedId(event) === IncidenciaButtonId.ANONIMO) return enterDescripcion(cloneSession(session));

  const documento = readTrimmedText(event);

  if (!isValidDocumentoFormat(documento)) {
    return buildResult(session, [sendButtons(INVALID_DOCUMENT_TEXT, CONTINUAR_ANONIMO_BUTTONS)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DNI] = documento;
  return enterDescripcion(next);
}

function handleAwaitingDescripcion(session: Session, event: InboundEvent): HandlerResult {
  const descripcion = readTrimmedText(event);

  if (!descripcion) return buildResult(session, [sendText(askDescripcion(session))]);

  if (descripcion.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(descripcionTooLongText(descripcion.length, MAX_DESCRIPCION_LENGTH))]);
  }

  if (looksLikeNoise(descripcion)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);

  if (descripcion.length < MIN_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(descripcionTooShortText(MIN_DESCRIPCION_LENGTH))]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DESCRIPCION_INCIDENCIA] = descripcion;
  return afterDescripcion(next);
}

function isFile(event: InboundEvent): boolean {
  return event.type === InboundEventType.IMAGE || event.type === InboundEventType.DOCUMENT;
}

function handleAwaitingFoto(session: Session, event: InboundEvent): HandlerResult {
  if (event.type === InboundEventType.IMAGE) return handleImagen(session, event);
  if (isFile(event)) return rechazoDeImagen(session, documentoNoGuardadoText(maxImagenLegibleText()));
  if (event.listId === IncidenciaButtonId.FOTO_OMITIR || event.listId === IncidenciaButtonId.FOTO_LISTO) {
    return askConfirmRegistro(session);
  }

  const typed = readTrimmedText(event);
  if (!typed) return withRejectionNotice(buildResult(session, [askFoto()]));

  const keyword = typed.toUpperCase();
  if (keyword === OMITIR_KEYWORD || keyword === LISTO_KEYWORD || resolveConfirmation(typed) === Confirmation.NO) {
    return askConfirmRegistro(session);
  }

  if (resolveConfirmation(typed) === Confirmation.YES || typed.length > FOTO_INTENT_MAX_LENGTH || looksLikeNoise(typed)) {
    return withRejectionNotice(buildResult(session, [askFoto()]));
  }

  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_FOTO_INTENT_PENDING;
  return buildResult(next, [query(QueryKind.ANALYZE_INCIDENCIA_FOTO_INTENT, { text: typed })]);
}

function rechazoDeImagen(session: Session, motivo: string): HandlerResult {
  const hasImagenes = readImagenes(session.slots).length > 0;
  const seguir = hasImagenes ? SEGUIR_CON_IMAGENES_TEXT : SEGUIR_SIN_IMAGENES_TEXT;
  return buildResult(session, [sendButtons(`${motivo} ${seguir}`, hasImagenes ? FOTO_LISTO_BUTTONS : FOTO_BUTTONS)]);
}

function handleImagen(session: Session, event: InboundEvent): HandlerResult {
  const recibidas = event.media?.length ? event.media : [buildImagenUnica(event)];
  const previas = readImagenes(session.slots);
  const aceptadas = [...previas];
  const rechazos = new Map<EvidenceRejection, number>();

  for (const imagen of recibidas) {
    const motivo = findMotivoDeRechazo(imagen, aceptadas);
    if (motivo) rechazos.set(motivo, (rechazos.get(motivo) ?? 0) + 1);
    else if (imagen.kind === InboundMediaKind.DATA) aceptadas.push(imagen.dataUri);
  }

  const next = cloneSession(session);
  if (aceptadas.length > previas.length) writeImagenes(next.slots, aceptadas);

  const resultado = imagenesRecibidasText({
    recibidas: recibidas.length,
    guardadas: aceptadas.length - previas.length,
    total: aceptadas.length,
    maximo: MAX_IMAGENES_POR_INCIDENCIA,
    tamano: maxImagenLegibleText(),
    rechazos: [...rechazos],
  });

  if (aceptadas.length >= MAX_IMAGENES_POR_INCIDENCIA) return askConfirmRegistro(next, resultado);
  if (aceptadas.length === 0) return buildResult(next, [sendButtons(`${resultado} ${SEGUIR_SIN_IMAGENES_TEXT}`, FOTO_BUTTONS)]);
  return buildResult(next, [sendButtons(`${resultado} ${SEGUIR_CON_IMAGENES_TEXT}`, FOTO_LISTO_BUTTONS)]);
}

function handleFotoIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { quiereOmitir?: boolean };
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;

  if (result.quiereOmitir === true) return askConfirmRegistro(next);

  return buildResult(next, [askFoto()]);
}

function confirmationText(session: Session, codigo: string): string {
  const establecimiento = slotText(session.slots, SlotKey.INCIDENCIA_ESTABLECIMIENTO_NOMBRE);
  return incidenciaRegistradaText(codigo, establecimiento, session.slots[SlotKey.DNI] !== undefined);
}

function failureText(reason: string | undefined): string {
  if (reason === RegistrationRejectReason.DAILY_LIMIT) return DAILY_LIMIT_TEXT;
  if (reason === RegistrationRejectReason.MEDIA_TOO_LARGE) return imagenMuyPesadaText(maxImagenLegibleText());
  return REGISTRO_FALLIDO_TEXT;
}

function handleSubmitPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as RegistrarIncidenciaResult;
  const next = cloneSession(session);
  delete next.slots[SlotKey.INCIDENCIA_IMAGENES];

  if (result.status === RegistrationStatus.ACCEPTED) {
    next.state = SessionState.INCIDENCIA_CONFIRMED;
    return buildResult(next, [sendText(confirmationText(next, result.codigo))]);
  }

  next.state = SessionState.INCIDENCIA_FAILED;
  const message = failureText(result.status === RegistrationStatus.REJECTED ? result.reason : undefined);
  return buildResult(next, [sendText(message)]);
}
