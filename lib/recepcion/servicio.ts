import { randomUUID } from "node:crypto";
import { actorCiudadano } from "@/lib/db/actor";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { currentTraceId } from "@/lib/observability/context";
import { logger } from "@/lib/observability/logger";
import { registrarIncidenciaSchema, type RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import { esImagenRechazada, validarImagen } from "@/lib/recepcion/imagenes/validacion";
import { buscarCodigoPorTrace, contarDelDia, insertarIncidencia, type DatosEvidencia } from "@/lib/recepcion/repositorio";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import { ImageValidationFailure } from "@/lib/enums/image-validation-failure";
import { isObject } from "@/lib/utils/type-guards";
import { MAX_INCIDENCIAS_POR_DIA } from "@/lib/constants/limits/incidencia";
import type { AlmacenEvidencias } from "@/lib/types/almacen-evidencias.types";

const isUniqueViolation = (error: unknown) => isObject(error) && "code" in error && error.code === "P2002";

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

const accepted = (codigo: string | null | undefined): RegistrarIncidenciaResult =>
  codigo ? { status: RegistrationStatus.ACCEPTED, codigo } : { status: RegistrationStatus.ACCEPTED };

async function codigoYaGuardado(traceId: string): Promise<string | null> {
  try {
    return await buscarCodigoPorTrace(traceId);
  } catch {
    return null;
  }
}

const isEvidencia = (value: DatosEvidencia | RegistrarIncidenciaResult): value is DatosEvidencia => "ruta" in value;

export async function registrarIncidencia(input: unknown, almacen: AlmacenEvidencias): Promise<RegistrarIncidenciaResult> {
  const parsed = registrarIncidenciaSchema.safeParse(input);
  if (!parsed.success) {
    logger.error("incidencia.invalid_submission", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return { status: RegistrationStatus.ERROR };
  }
  const { waId, dni, nombreCompleto, establecimientoId, descripcion, mediaDataUris } = parsed.data;

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
      { waId, dni, nombreCompleto, establecimientoId, descripcion, traceId },
      evidencias,
      actorCiudadano(waId),
    );
    return accepted(incidencia.codigo);
  } catch (error) {
    if (isUniqueViolation(error)) return accepted(await codigoYaGuardado(traceId));
    logger.error("incidencia.persist_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }
}
