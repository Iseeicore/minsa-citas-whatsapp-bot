const LETTER = /\p{L}/gu;

export const NOISE_LETTER_RATIO = 0.3;

export function letterRatio(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 1;
  const letters = trimmed.match(LETTER)?.length ?? 0;
  return letters / trimmed.length;
}

export function looksLikeNoise(text: string): boolean {
  return letterRatio(text) < NOISE_LETTER_RATIO;
}
