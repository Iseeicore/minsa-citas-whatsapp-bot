import { timedFetch } from "@/lib/observability/http";
import { mediaStorageConfig } from "@/lib/recepcion/imagenes/config";
import { isRecord, isString } from "@/lib/utils/type-guards";
import { ImageStorageError } from "@/lib/errors/image-storage-error";
import { ImageStorageFailure } from "@/lib/enums/image-storage-failure";
import type { AlmacenEvidencias } from "@/lib/types/almacen-evidencias.types";

export const almacenHttp: AlmacenEvidencias = {
  guardar: ({ bytes, mimeType }) => guardarImagenHttp(bytes, mimeType),
};

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error: unknown) {
    throw new ImageStorageError(ImageStorageFailure.UNREADABLE_BODY, response.status, { cause: error });
  }
}

export async function guardarImagenHttp(bytes: Buffer, mimeType: string): Promise<{ ruta: string }> {
  const { baseUrl, token, timeoutMs } = mediaStorageConfig();

  const response = await timedFetch("media", "upload", baseUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new ImageStorageError(ImageStorageFailure.BAD_STATUS, response.status);

  const body = await readJsonBody(response);
  const ruta = isRecord(body) ? body.ruta : undefined;
  if (!isString(ruta) || ruta === "") throw new ImageStorageError(ImageStorageFailure.MISSING_PATH);
  return { ruta };
}
