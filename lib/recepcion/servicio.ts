import { randomUUID } from "node:crypto";
import { actorCiudadano } from "@/lib/db/actor";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { currentTraceId } from "@/lib/observability/context";
import { logger } from "@/lib/observability/logger";
import { registrarIncidenciaSchema, type RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import { guardarImagenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { insertarIncidencia, type DatosEvidencia } from "@/lib/recepcion/repositorio";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

/** Sube la foto antes de tocar la base: si el servicio de imágenes falla no queda nada a medias y el ciudadano puede reintentar. */
async function subirEvidencia(mediaDataUri: string): Promise<DatosEvidencia | RegistrarIncidenciaResult> {
  const image = parseImageDataUri(mediaDataUri);
  if (image === null) return { status: "rejected", reason: "other" };
  if ("tooLarge" in image) return { status: "rejected", reason: "media_too_large" };

  try {
    const { ruta } = await guardarImagenHttp(image.bytes, image.mimeType);
    return { mimeType: image.mimeType, tamano: image.bytes.length, ruta };
  } catch (error) {
    logger.error("incidencia.media_upload_failed", { error });
    return { status: "error" };
  }
}

const isEvidencia = (value: DatosEvidencia | RegistrarIncidenciaResult): value is DatosEvidencia => "ruta" in value;

/**
 * Registra la incidencia directo en la base. Nunca simula un éxito: sin base o ante un fallo responde error.
 * El trace id del turno es único; si se repite, la incidencia ya estaba guardada y se responde como aceptada.
 */
export async function registrarIncidencia(input: unknown): Promise<RegistrarIncidenciaResult> {
  const parsed = registrarIncidenciaSchema.safeParse(input);
  if (!parsed.success) {
    logger.error("incidencia.invalid_submission", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return { status: "error" };
  }
  const { waId, dni, nombreCompleto, descripcion, mediaDataUri } = parsed.data;

  if (!isDatabaseEnabled()) {
    logger.error("incidencia.not_persisted", { reason: "DATABASE_ENABLED=false" });
    return { status: "error" };
  }

  let evidencia: DatosEvidencia | null = null;
  if (mediaDataUri) {
    if (isMediaStorageConfigured()) {
      const subida = await subirEvidencia(mediaDataUri);
      if (!isEvidencia(subida)) return subida;
      evidencia = subida;
    } else {
      logger.warn("incidencia.media_not_stored", { reason: "no hay servicio de imágenes configurado" });
    }
  }

  try {
    await insertarIncidencia(
      { waId, dni, nombreCompleto, descripcion, traceId: currentTraceId() ?? randomUUID() },
      evidencia,
      actorCiudadano(waId),
    );
    return { status: "accepted" };
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "accepted" };
    logger.error("incidencia.persist_failed", { error });
    return { status: "error" };
  }
}
