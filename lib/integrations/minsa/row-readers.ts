import { logger } from "@/lib/observability/logger";
import type { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

export type RawRow = Record<string, unknown>;

export function isRawRow(value: unknown): value is RawRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texto no vacío; un número finito se acepta y se convierte a texto. Cualquier otra cosa es ausente. */
export function readString(row: RawRow, key: string): string | undefined {
  const value = row[key];
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Número finito; un texto numérico se acepta. NaN, Infinity, null y vacío son ausentes. */
export function readNumber(row: RawRow, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Valida cada fila cruda con `parseRow`, descarta las inválidas y deja constancia de cuántas se perdieron. */
export function parseRows<T>(
  endpoint: MinsaEndpoint,
  rawRows: readonly unknown[],
  parseRow: (row: RawRow) => T | undefined,
): T[] {
  const items = rawRows
    .map((row) => (isRawRow(row) ? parseRow(row) : undefined))
    .filter((item): item is T => item !== undefined);

  if (items.length < rawRows.length) {
    logger.warn("minsa.catalog.rows_discarded", {
      endpoint,
      discarded: rawRows.length - items.length,
      total: rawRows.length,
    });
  }

  return items;
}
