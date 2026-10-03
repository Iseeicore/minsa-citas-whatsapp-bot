import { logger } from "@/lib/observability/logger";
import { isRawRow, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postWithBearer } from "@/lib/integrations/minsa/wire";
import type { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

const HTTP_UNAUTHORIZED = 401;

export type CatalogFetchResult<T> =
  | { status: "found"; items: T[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

type CatalogFetchParams<T> = {
  endpoint: MinsaEndpoint;
  body: Record<string, unknown>;
  bearer: string;
  rowsPath: readonly string[];
  parseRow: (row: RawRow) => T | undefined;
};

function rowsAt(body: unknown, path: readonly string[]): unknown {
  let node: unknown = body;
  for (const key of path) {
    if (!isRawRow(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Esqueleto común de los catálogos con bearer. Las filas inválidas se descartan; si MINSA devolvió
 * filas pero ninguna es válida el contrato está roto y es "error", no "empty".
 */
export async function fetchCatalogItems<T>(params: CatalogFetchParams<T>): Promise<CatalogFetchResult<T>> {
  const response = await postWithBearer(params.endpoint, params.body, params.bearer);
  if (response.status === HTTP_UNAUTHORIZED) return { status: "unauthorized" };
  if (!response.ok) return { status: "error" };

  const body: unknown = await response.json().catch(() => undefined);
  if (body === undefined) return { status: "error" };

  const rawRows = rowsAt(body, params.rowsPath) ?? [];
  if (!Array.isArray(rawRows)) return { status: "error" };
  if (rawRows.length === 0) return { status: "empty" };

  const items = rawRows
    .map((row) => (isRawRow(row) ? params.parseRow(row) : undefined))
    .filter((item): item is T => item !== undefined);

  if (items.length < rawRows.length) {
    logger.warn("minsa.catalog.rows_discarded", {
      endpoint: params.endpoint,
      discarded: rawRows.length - items.length,
      total: rawRows.length,
    });
  }

  return items.length === 0 ? { status: "error" } : { status: "found", items };
}
