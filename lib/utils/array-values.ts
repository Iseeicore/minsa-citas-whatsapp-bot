export function arrayOr<T>(value: T[] | null | undefined, fallback?: T[]): T[];
export function arrayOr<T = unknown>(value: unknown, fallback?: T[]): T[];
export function arrayOr<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
