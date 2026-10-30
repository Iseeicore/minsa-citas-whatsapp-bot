import { IMAGE_DATA_URI } from "@/lib/constants/regex/incidencia";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { ParsedImageStatus } from "@/lib/enums/parsed-image-status";

export type ParsedImage =
  | { status: ParsedImageStatus.PARSED; mimeType: string; bytes: Buffer }
  | { status: ParsedImageStatus.TOO_LARGE }
  | { status: ParsedImageStatus.INVALID };

export function parseImageDataUri(dataUri: string): ParsedImage {
  const match = IMAGE_DATA_URI.exec(dataUri);
  if (!match) return { status: ParsedImageStatus.INVALID };

  const [, mimeType, base64] = match;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const decodedLength = Math.floor((base64.length * 3) / 4) - padding;
  if (decodedLength > getEvidenceImageMaxBytes()) return { status: ParsedImageStatus.TOO_LARGE };

  return { status: ParsedImageStatus.PARSED, mimeType: mimeType.toLowerCase(), bytes: Buffer.from(base64, "base64") };
}
