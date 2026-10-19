import { randomUUID } from "node:crypto";
import { actorCiudadano } from "@/lib/db/actor";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { currentTraceId } from "@/lib/observability/context";
import { logger } from "@/lib/observability/logger";
import { registrarIncidenciaSchema, type RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import { guardarImagenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { buscarCodigoPorTrace, contarDelDia, insertarIncidencia, type DatosEvidencia } from "@/lib/recepcion/repositorio";
import { RegistrationStatus } from "@/lib/enums/registration-status";
import { RegistrationRejectReason } from "@/lib/enums/registration-reject-reason";
import { isObject } from "@/lib/utils/type-guards";
import { MAX_INCIDENCIAS_POR_DIA } from "@/lib/constants/limits/incidencia";

const isUniqueViolation = (error: unknown) => isObject(error) && "code" in error && error.code === "P2002";

async function subirEvidencia(mediaDataUri: string): Promise<DatosEvidencia | RegistrarIncidenciaResult> {
  const image = parseImageDataUri(mediaDataUri);
  if (image === null) return { status: RegistrationStatus.REJECTED, reason: RegistrationRejectReason.OTHER };
  if ("tooLarge" in image) return { status: RegistrationStatus.REJECTED, reason: RegistrationRejectReason.MEDIA_TOO_LARGE };

  try {
    const { ruta } = await guardarImagenHttp(image.bytes, image.mimeType);
    return { mimeType: image.mimeType, tamano: image.bytes.length, ruta };
  } catch (error) {
    logger.error("incidencia.media_upload_failed", { error });
    return { status: RegistrationStatus.ERROR };
  }
}

/** Sin servicio de imágenes la evidencia se guarda en la propia base: la ruta es el data URI (base64) de la imagen. */
function evidenciaEnLaBase(mediaDataUri: string): DatosEvidencia | RegistrarIncidenciaResult {
  const image = parseImageDataUri(mediaDataUri);
  if (image === null) return { status: RegistrationStatus.REJECTED, reason: RegistrationRejectReason.OTHER };
  if ("tooLarge" in image) return { status: RegistrationStatus.REJECTED, reason: RegistrationRejectReason.MEDIA_TOO_LARGE };
  return { mimeType: image.mimeType, tamano: image.bytes.length, ruta: mediaDataUri };
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

export async function registrarIncidencia(input: unknown): Promise<RegistrarIncidenciaResult> {
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
    const subida = isMediaStorageConfigured() ? await subirEvidencia(mediaDataUri) : evidenciaEnLaBase(mediaDataUri);
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
