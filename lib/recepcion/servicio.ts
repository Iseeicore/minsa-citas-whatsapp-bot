import { randomUUID } from "node:crypto";
import { actorCiudadano } from "@/lib/db/actor";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { currentTraceId } from "@/lib/observability/context";
import { logger } from "@/lib/observability/logger";
import { registrarIncidenciaSchema, type RegistrarIncidenciaResult } from "@/lib/recepcion/dto";
import { guardarImagenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import { parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { buscarCodigoPorTrace, insertarIncidencia, type DatosEvidencia } from "@/lib/recepcion/repositorio";

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

const accepted = (codigo: string | null | undefined): RegistrarIncidenciaResult => (codigo ? { status: "accepted", codigo } : { status: "accepted" });

/** Una reentrega del mismo turno no duplica la incidencia: se responde con el código de la que ya existe. */
async function codigoYaGuardado(traceId: string): Promise<string | null> {
  try {
    return await buscarCodigoPorTrace(traceId);
  } catch {
    return null;
  }
}

const isEvidencia = (value: DatosEvidencia | RegistrarIncidenciaResult): value is DatosEvidencia => "ruta" in value;

/** Registra la incidencia directo en la base. Nunca simula un éxito; si el trace id ya existía, responde aceptada. */
export async function registrarIncidencia(input: unknown): Promise<RegistrarIncidenciaResult> {
  const parsed = registrarIncidenciaSchema.safeParse(input);
  if (!parsed.success) {
    logger.error("incidencia.invalid_submission", { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return { status: "error" };
  }
  const { waId, dni, nombreCompleto, establecimientoId, descripcion, mediaDataUri } = parsed.data;

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

  const traceId = currentTraceId() ?? randomUUID();
  try {
    const incidencia = await insertarIncidencia(
      { waId, dni, nombreCompleto, establecimientoId, descripcion, traceId },
      evidencia,
      actorCiudadano(waId),
    );
    return accepted(incidencia.codigo);
  } catch (error) {
    if (isUniqueViolation(error)) return accepted(await codigoYaGuardado(traceId));
    logger.error("incidencia.persist_failed", { error });
    return { status: "error" };
  }
}
