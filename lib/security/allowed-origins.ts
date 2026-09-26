function toOrigin(entry: string): string | undefined {
  try {
    const { origin } = new URL(entry);
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

export function parseAllowedOrigins(raw: string | undefined): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const entry of (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean)) {
    const origin = toOrigin(entry);
    if (origin) origins.push(origin);
    else invalid.push(entry);
  }
  return { origins, invalid };
}
