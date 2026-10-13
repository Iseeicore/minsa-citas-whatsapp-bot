export function arrayOr<T>(value: T[] | null | undefined, fallback?: T[]): T[];
export function arrayOr<T = unknown>(value: unknown, fallback?: T[]): T[];
export function arrayOr<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}
