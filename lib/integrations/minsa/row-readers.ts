import { logger } from "@/lib/observability/logger";
import type { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { isRecord } from "@/lib/utils/type-guards";

export type RawRow = Record<string, unknown>;

export function parseRows<T>(endpoint: MinsaEndpoint, rawRows: readonly unknown[], parseRow: (row: RawRow) => T | undefined): T[] {
  const items = rawRows.map((row) => (isRecord(row) ? parseRow(row) : undefined)).filter((item): item is T => item !== undefined);

  if (items.length < rawRows.length) {
    logger.warn("minsa.catalog.rows_discarded", {
      endpoint,
      discarded: rawRows.length - items.length,
      total: rawRows.length,
    });
  }

  return items;
}
