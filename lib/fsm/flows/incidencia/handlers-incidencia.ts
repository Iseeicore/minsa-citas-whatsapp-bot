import { handleAwaitingBorradorExtra, handleConfirmBorrador } from "@/lib/fsm/flows/incidencia/borrador";
import {
  askConsentimiento,
  handleConsentCheckPending,
  handleConsentimiento,
  handleConsentRegisterPending,
} from "@/lib/fsm/flows/incidencia/consentimiento";
import { afterDescripcion, askConfirmRegistro, askFoto, handleConfirmRegistro } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import {
  handleAwaitingUbicacion,
  handleConfirmOmitir,
  handleConfirmUbicacion,
  handleUbicacionPending,
} from "@/lib/fsm/flows/incidencia/ubicacion";
import { isValidDniFormat, isValidDocumentoFormat } from "@/lib/fsm/parsing/text/identity-format";
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
import type { HandleEvent, HandlerResult, InboundEvent, QueryResultEvent, Session } from "@/lib/fsm/core/types";
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
  INCIDENCIA_NOMBRE_BUTTONS,
  ONLY_DNI_TEXT,
  ONLY_DNI_BUTTONS,
  VERIFICANDO_DOCUMENTO_TEXT,
  RENIEC_FAILED_TEXT,
  ASK_NOMBRE_TEXT,
  UNREADABLE_TEXT_RETRY,
  DOCUMENTO_NO_GUARDADO_TEXT,
  FOTO_BUTTONS,
  FOTO_LISTO_BUTTONS,
  IMAGEN_NO_DESCARGADA_TEXT,
  IMAGEN_NO_VALIDA_TEXT,
  IMAGEN_REPETIDA_TEXT,
  LISTO_KEYWORD,
  SEGUIR_CON_IMAGENES_TEXT,
  SEGUIR_SIN_IMAGENES_TEXT,
  imagenNoGuardadaMuyPesadaText,
  imagenRecibidaText,
  imagenesCompletasText,
  INCIDENCIA_REGISTRADA_SIN_CODIGO_TEXT,
  SEGUIMIENTO_IDENTIFICADO_TEXT,
  SEGUIMIENTO_ANONIMO_TEXT,
  DAILY_LIMIT_TEXT,
  REGISTRO_FALLIDO_TEXT,
  graciasNombreText,
  descripcionTooLongText,
  descripcionTooShortText,
  OMITIR_KEYWORD,
  incidenciaRegistradaText,
  INCIDENCIA_CANCELADA_TEXT,
  IMAGEN_MUY_PESADA_TEXT,
} from "@/lib/constants/textos/incidencia";
import { INVALID_DNI_TEXT } from "@/lib/constants/textos/fallas";
import { LookupStatus } from "@/lib/enums/lookup-status";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import { isNonEmptyString } from "@/lib/utils/type-guards";
import {
  MAX_DESCRIPCION_LENGTH,
  MAX_IMAGENES_POR_INCIDENCIA,
  MIN_DESCRIPCION_LENGTH,
  FOTO_INTENT_MAX_LENGTH,
} from "@/lib/constants/limits/incidencia";
import { MAX_IMAGE_BYTES } from "@/lib/recepcion/imagenes/data-uri";
import { esImagenRechazada, validarImagen } from "@/lib/recepcion/imagenes/validacion";
import { MediaFailure } from "@/lib/enums/media-failure";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { readImagenes, writeImagenes } from "@/lib/fsm/flows/incidencia/imagenes";

function cancel(): HandlerResult {
  return buildResult({ state: SessionState.INCIDENCIA_CANCELLED, slots: {}, counters: {} }, [sendText(INCIDENCIA_CANCELADA_TEXT)]);
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

  if (replyId === IncidenciaButtonId.CON_NOMBRE) {
    next.state = SessionState.INCIDENCIA_AWAITING_DNI;
    return buildResult(next, [sendText(ASK_DOCUMENTO_TEXT)]);
  }

  if (replyId === IncidenciaButtonId.ANONIMO) return askConsentimiento(next);

  return withRejectionNotice(buildResult(session, [sendButtons(IDENTITY_QUESTION_TEXT, INCIDENCIA_NOMBRE_BUTTONS)]));
}

function handleAwaitingDni(session: Session, event: InboundEvent): HandlerResult {
  if (readTappedId(event) === IncidenciaButtonId.ANONIMO) return askConsentimiento(cloneSession(session));

  const documento = readTrimmedText(event);

  if (!isValidDniFormat(documento)) {
    if (isValidDocumentoFormat(documento)) return buildResult(session, [sendButtons(ONLY_DNI_TEXT, ONLY_DNI_BUTTONS)]);
    return buildResult(session, [sendText(INVALID_DNI_TEXT)]);
  }

  const next = cloneSession(session);
  next.slots[SlotKey.DNI] = documento;
  next.state = SessionState.INCIDENCIA_RENIEC_PENDING;
  return buildResult(next, [sendText(VERIFICANDO_DOCUMENTO_TEXT), query(QueryKind.RENIEC_LOOKUP, { dni: documento })]);
}

function handleReniecPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; nombreCompleto?: string };
  const next = cloneSession(session);

  if (result.status === LookupStatus.FOUND && isNonEmptyString(result.nombreCompleto)) {
    next.slots[SlotKey.NOMBRE_COMPLETO] = result.nombreCompleto.trim();
    return withGreeting(askConsentimiento(next), result.nombreCompleto.trim());
  }

  next.state = SessionState.INCIDENCIA_AWAITING_NOMBRE_LIBRE;
  return buildResult(next, [sendText(RENIEC_FAILED_TEXT)]);
}

function withGreeting(result: HandlerResult, nombre: string): HandlerResult {
  return { ...result, effects: [sendText(graciasNombreText(nombre)), ...result.effects] };
}

function handleAwaitingNombreLibre(session: Session, event: InboundEvent): HandlerResult {
  const nombre = readTrimmedText(event);

  if (!nombre) return buildResult(session, [sendText(ASK_NOMBRE_TEXT)]);
  if (looksLikeNoise(nombre)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);

  const next = cloneSession(session);
  next.slots[SlotKey.NOMBRE_COMPLETO] = nombre;
  return askConsentimiento(next);
}

function handleAwaitingDescripcion(session: Session, event: InboundEvent): HandlerResult {
  const descripcion = readTrimmedText(event);

  if (!descripcion || descripcion.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(descripcionTooLongText(MAX_DESCRIPCION_LENGTH))]);
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
  if (isFile(event)) return rechazoDeImagen(session, DOCUMENTO_NO_GUARDADO_TEXT);
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

/** Dice por qué no se guardó el archivo y deja a la persona seguir con otra imagen o continuar. */
function rechazoDeImagen(session: Session, motivo: string): HandlerResult {
  const hasImagenes = readImagenes(session.slots).length > 0;
  const seguir = hasImagenes ? SEGUIR_CON_IMAGENES_TEXT : SEGUIR_SIN_IMAGENES_TEXT;
  return buildResult(session, [sendButtons(`${motivo} ${seguir}`, hasImagenes ? FOTO_LISTO_BUTTONS : FOTO_BUTTONS)]);
}

const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

const motivoDeImagenRechazada = (failure: ImageValidationFailure): string =>
  failure === ImageValidationFailure.TOO_LARGE ? imagenNoGuardadaMuyPesadaText(MAX_IMAGE_MB) : IMAGEN_NO_VALIDA_TEXT;

/** Cada imagen se acumula en la sesión (hasta el máximo) como data URI hasta que se registra la incidencia. */
function handleImagen(session: Session, event: InboundEvent): HandlerResult {
  const imagenes = readImagenes(session.slots);

  if (imagenes.length >= MAX_IMAGENES_POR_INCIDENCIA) {
    const confirm = askConfirmRegistro(session);
    return { ...confirm, effects: [sendText(imagenesCompletasText(MAX_IMAGENES_POR_INCIDENCIA)), ...confirm.effects] };
  }

  if (event.mediaFailure === MediaFailure.TOO_LARGE) {
    return rechazoDeImagen(session, imagenNoGuardadaMuyPesadaText(MAX_IMAGE_MB));
  }
  if (!event.mediaDataUri) return rechazoDeImagen(session, IMAGEN_NO_DESCARGADA_TEXT);

  const imagen = validarImagen(event.mediaDataUri);
  if (esImagenRechazada(imagen)) return rechazoDeImagen(session, motivoDeImagenRechazada(imagen.failure));
  if (imagenes.includes(event.mediaDataUri)) return rechazoDeImagen(session, IMAGEN_REPETIDA_TEXT);

  const next = cloneSession(session);
  writeImagenes(next.slots, [...imagenes, event.mediaDataUri]);
  const cantidad = imagenes.length + 1;

  if (cantidad >= MAX_IMAGENES_POR_INCIDENCIA) {
    const confirm = askConfirmRegistro(next);
    return { ...confirm, effects: [sendText(imagenesCompletasText(MAX_IMAGENES_POR_INCIDENCIA)), ...confirm.effects] };
  }

  return buildResult(next, [sendButtons(imagenRecibidaText(cantidad, MAX_IMAGENES_POR_INCIDENCIA), FOTO_LISTO_BUTTONS)]);
}

function handleFotoIntentPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { quiereOmitir?: boolean };
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_FOTO;

  if (result.quiereOmitir === true) return askConfirmRegistro(next);

  return buildResult(next, [askFoto()]);
}

function confirmationText(session: Session, codigo: string | undefined): string {
  const hasEstablecimiento = session.slots[SlotKey.INCIDENCIA_ESTABLECIMIENTO_ID] !== undefined;
  const identificado = session.slots[SlotKey.DNI] !== undefined;

  if (!(hasEstablecimiento && codigo)) return INCIDENCIA_REGISTRADA_SIN_CODIGO_TEXT;

  const base = incidenciaRegistradaText(codigo);
  const adicional = identificado ? SEGUIMIENTO_IDENTIFICADO_TEXT : SEGUIMIENTO_ANONIMO_TEXT;
  return `${base} ${adicional}`;
}

function failureText(reason: string | undefined): string {
  if (reason === RegistrationRejectReason.DAILY_LIMIT) return DAILY_LIMIT_TEXT;
  if (reason === RegistrationRejectReason.MEDIA_TOO_LARGE) return IMAGEN_MUY_PESADA_TEXT;
  return REGISTRO_FALLIDO_TEXT;
}

function handleSubmitPending(session: Session, event: QueryResultEvent): HandlerResult {
  const result = event.result as { status: string; reason?: string; codigo?: string };
  const next = cloneSession(session);
  delete next.slots[SlotKey.INCIDENCIA_IMAGENES];

  if (result.status === RegistrationStatus.ACCEPTED) {
    next.state = SessionState.INCIDENCIA_CONFIRMED;
    return buildResult(next, [sendText(confirmationText(next, result.codigo))]);
  }

  next.state = SessionState.INCIDENCIA_FAILED;
  const message = failureText(result.reason);
  return buildResult(next, [sendText(message)]);
}
