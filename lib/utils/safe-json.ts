export function parseJsonOr(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
}
