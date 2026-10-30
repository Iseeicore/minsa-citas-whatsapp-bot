import { BYTES_PER_MEGABYTE } from "@/lib/constants/limits/bytes";
import { EVIDENCE_IMAGE_MAX_MB_DEFAULT, EVIDENCE_IMAGE_MAX_MB_MIN, META_IMAGE_MAX_MB } from "@/lib/constants/limits/incidencia";
import { POSITIVE_INTEGER } from "@/lib/constants/regex/text";

type Env = Record<string, string | undefined>;

function parseEvidenceImageMaxMb(raw: string | undefined): number | undefined {
  const value = raw?.trim() ?? "";
  if (!POSITIVE_INTEGER.test(value)) return undefined;
  const megabytes = Number(value);
  return megabytes >= EVIDENCE_IMAGE_MAX_MB_MIN && megabytes <= META_IMAGE_MAX_MB ? megabytes : undefined;
}

export function invalidEvidenceImageMaxMb(env: Env = process.env): string | undefined {
  const raw = env.EVIDENCE_IMAGE_MAX_MB;
  if (!raw?.trim()) return undefined;
  return parseEvidenceImageMaxMb(raw) === undefined ? raw : undefined;
}

export function evidenceImageMaxMegabytes(env: Env = process.env): number {
  return parseEvidenceImageMaxMb(env.EVIDENCE_IMAGE_MAX_MB) ?? EVIDENCE_IMAGE_MAX_MB_DEFAULT;
}

export function evidenceImageMaxBytes(env: Env = process.env): number {
  return evidenceImageMaxMegabytes(env) * BYTES_PER_MEGABYTE;
}
