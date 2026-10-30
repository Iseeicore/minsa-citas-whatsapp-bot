import { randomUUID } from "node:crypto";
import { actorCiudadano } from "@/lib/db/actor";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { currentTraceId } from "@/lib/observability/context";
import { logger } from "@/lib/observability/logger";
import { registrarIncidenciaSchema, type RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import { esImagenRechazada, validarImagen } from "@/lib/recepcion/imagenes/validacion";
import { contarDelDia, findCodigoPorTrace, insertarIncidencia, type DatosEvidencia } from "@/lib/recepcion/repositorio";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { isRecord, isString } from "@/lib/utils/type-guards";
import { MAX_INCIDENCIAS_POR_DIA } from "@/lib/constants/limits/incidencia";
import { INCIDENCIA_TRACE_ID_UNIQUE_TARGETS, PRISMA_UNIQUE_VIOLATION_CODE } from "@/lib/constants/prisma-unique";
import type { AlmacenEvidencias } from "@/lib/types/almacen-evidencias.types";

function isTraceIdReplay(error: unknown): boolean {
  if (!isRecord(error) || error.code !== PRISMA_UNIQUE_VIOLATION_CODE || !isRecord(error.meta)) return false;
  const targets: unknown[] = Array.isArray(error.meta.target) ? error.meta.target : [error.meta.target];
  return targets.some((target) => isString(target) && INCIDENCIA_TRACE_ID_UNIQUE_TARGETS.includes(target));
}

const MOTIVO_DE_RECHAZO: Readonly<Record<ImageValidationFailure, RegistrationRejectReason>> = {
  [ImageValidationFailure.TOO_LARGE]: RegistrationRejectReason.MEDIA_TOO_LARGE,
  [ImageValidationFailure.INVALID]: RegistrationRejectReason.OTHER,
};

async function guardarEvidencia(mediaDataUri: string, almacen: AlmacenEvidencias): Promise<DatosEvidencia | RegistrarIncidenciaResult> {
  const imagen = validarImagen(mediaDataUri);
  if (esImagenRechazada(imagen)) return { status: RegistrationStatus.REJECTED, reason: MOTIVO_DE_RECHAZO[imagen.failure] };

  try {
    const { ruta } = await almacen.guardar(imagen);
    return { mimeType: imagen.mimeType, tamano: imagen.bytes.length, ruta };
  } catch (error: unknown) {
    logger.error("incidencia.media_upload_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }
}

function acceptedWithCodigo(codigo: string | undefined): RegistrarIncidenciaResult {
  if (codigo) return { status: RegistrationStatus.ACCEPTED, codigo };
  logger.error("incidencia.persist_failed", { reason: "codigo_missing" });
  return { status: RegistrationStatus.ERROR };
}

async function answerReplay(traceId: string): Promise<RegistrarIncidenciaResult> {
  try {
    return acceptedWithCodigo(await findCodigoPorTrace(traceId));
  } catch (error: unknown) {
    logger.error("incidencia.persist_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }
}

const isEvidencia = (value: DatosEvidencia | RegistrarIncidenciaResult): value is DatosEvidencia => "ruta" in value;

export async function registrarIncidencia(input: unknown, almacen: AlmacenEvidencias): Promise<RegistrarIncidenciaResult> {
  const parsed = registrarIncidenciaSchema.safeParse(input);
  if (!parsed.success) {
    logger.error("incidencia.invalid_submission", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return { status: RegistrationStatus.ERROR };
  }
  const { waId, dni, establecimientoId, descripcion, mediaDataUris, canal } = parsed.data;

  if (!isDatabaseEnabled()) {
    logger.error("incidencia.not_persisted", { reason: "DATABASE_ENABLED=false" });
    return { status: RegistrationStatus.ERROR };
  }

  const traceId = currentTraceId() ?? randomUUID();
  try {
    if ((await contarDelDia(waId, traceId)) >= MAX_INCIDENCIAS_POR_DIA) {
      logger.warn("incidencia.daily_limit_reached", { limit: MAX_INCIDENCIAS_POR_DIA });
      return { status: RegistrationStatus.REJECTED, reason: RegistrationRejectReason.DAILY_LIMIT };
    }
  } catch (error) {
    logger.error("incidencia.persist_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }

  const evidencias: DatosEvidencia[] = [];
  for (const mediaDataUri of mediaDataUris) {
    const subida = await guardarEvidencia(mediaDataUri, almacen);
    if (!isEvidencia(subida)) return subida;
    evidencias.push(subida);
  }

  try {
    const incidencia = await insertarIncidencia(
      { waId, dni, establecimientoId, descripcion, traceId, canal },
      evidencias,
      actorCiudadano(waId),
    );
    return acceptedWithCodigo(incidencia.codigo);
  } catch (error: unknown) {
    if (isTraceIdReplay(error)) return answerReplay(traceId);
    logger.error("incidencia.persist_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }
}
