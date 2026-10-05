const DEFAULT_TIMEOUT_MS = 10_000;

export type MediaStorageConfig = { baseUrl: string; token: string | null; timeoutMs: number };

/** El servicio de imágenes es opcional y agnóstico: se configura solo por variables de entorno. */
export function isMediaStorageConfigured(): boolean {
  return Boolean(process.env.MEDIA_STORAGE_BASE_URL);
}

export function mediaStorageConfig(): MediaStorageConfig {
  const timeout = Number(process.env.MEDIA_STORAGE_TIMEOUT_MS);
  return {
    baseUrl: process.env.MEDIA_STORAGE_BASE_URL ?? "",
    token: process.env.MEDIA_STORAGE_TOKEN || null,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}
