import { isFiniteNumber, isNonEmptyString } from "@/lib/utils/type-guards";

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (isNonEmptyString(value)) return value;
  if (isFiniteNumber(value)) return String(value);
  return undefined;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (isFiniteNumber(value)) return value;
  if (isNonEmptyString(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
