import { IMAGE_DATA_URI } from "@/lib/constants/regex/incidencia";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";

export type ParsedImage = { mimeType: string; bytes: Buffer };

export function parseImageDataUri(dataUri: string): ParsedImage | { tooLarge: true } | null {
  const match = IMAGE_DATA_URI.exec(dataUri);
  if (!match) return null;

  const [, mimeType, base64] = match;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedLength = Math.floor((base64.length * 3) / 4) - padding;
  if (decodedLength > getEvidenceImageMaxBytes()) return { tooLarge: true };

  return { mimeType: mimeType.toLowerCase(), bytes: Buffer.from(base64, "base64") };
}
