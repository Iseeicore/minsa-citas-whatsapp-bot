export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ParsedImage = { mimeType: string; bytes: Buffer };

const IMAGE_DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

/** Lee un data URI de imagen. Devuelve `null` si no es una imagen en base64 y `{ tooLarge }` si pasa del límite (sin decodificarla). */
export function parseImageDataUri(dataUri: string): ParsedImage | { tooLarge: true } | null {
  const match = IMAGE_DATA_URI.exec(dataUri);
  if (!match) return null;

  const [, mimeType, base64] = match;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedLength = Math.floor((base64.length * 3) / 4) - padding;
  if (decodedLength > MAX_IMAGE_BYTES) return { tooLarge: true };

  return { mimeType: mimeType.toLowerCase(), bytes: Buffer.from(base64, "base64") };
}
