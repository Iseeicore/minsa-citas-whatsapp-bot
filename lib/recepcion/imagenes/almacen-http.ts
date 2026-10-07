import { timedFetch } from "@/lib/observability/http";
import { mediaStorageConfig } from "@/lib/recepcion/imagenes/config";

/**
 * Adaptador HTTP del servicio de imágenes (contrato a confirmar con OGTI): POST con los bytes y su mime type,
 * `Authorization: Bearer` si hay token; responde `{ "ruta": "..." }`.
 */
export async function guardarImagenHttp(bytes: Buffer, mimeType: string): Promise<{ ruta: string }> {
  const { baseUrl, token, timeoutMs } = mediaStorageConfig();

  const response = await timedFetch("media", "upload", baseUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`El servicio de imágenes respondió ${response.status}`);

  const body = (await response.json().catch(() => null)) as { ruta?: unknown } | null;
  if (typeof body?.ruta !== "string" || body.ruta === "") throw new Error("El servicio de imágenes no devolvió una ruta");
  return { ruta: body.ruta };
}
