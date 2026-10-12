import { parseRows, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postWithBearer } from "@/lib/integrations/minsa/wire";
import type { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { CatalogStatus } from "@/lib/enums/catalog-status";
import { isRecord } from "@/lib/utils/type-guards";

const HTTP_UNAUTHORIZED = 401;

export type CatalogFetchResult<T> =
  | { status: `${CatalogStatus.FOUND}`; items: T[]; page?: number; totalPages?: number }
  | { status: `${CatalogStatus.EMPTY}` }
  | { status: `${CatalogStatus.ERROR}` }
  | { status: `${CatalogStatus.UNAUTHORIZED}` };

type CatalogFetchParams<T> = {
  endpoint: MinsaEndpoint;
  body: Record<string, unknown>;
  bearer: string;
  rowsPath: readonly string[];
  parseRow: (row: RawRow) => T | undefined;
  pageInfo?: (body: unknown) => { page: number; totalPages: number } | undefined;
};

function rowsAt(body: unknown, path: readonly string[]): unknown {
  let node: unknown = body;
  for (const key of path) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

export async function fetchCatalogItems<T>(params: CatalogFetchParams<T>): Promise<CatalogFetchResult<T>> {
  const response = await postWithBearer(params.endpoint, params.body, params.bearer);
  if (response.status === HTTP_UNAUTHORIZED) return { status: CatalogStatus.UNAUTHORIZED };
  if (!response.ok) return { status: CatalogStatus.ERROR };

  const body: unknown = await response.json().catch(() => undefined);
  if (body === undefined) return { status: CatalogStatus.ERROR };

  const rawRows = rowsAt(body, params.rowsPath) ?? [];
  if (!Array.isArray(rawRows)) return { status: CatalogStatus.ERROR };
  if (rawRows.length === 0) return { status: CatalogStatus.EMPTY };

  const items = parseRows(params.endpoint, rawRows, params.parseRow);
  if (items.length === 0) return { status: CatalogStatus.ERROR };
  return { status: CatalogStatus.FOUND, items, ...params.pageInfo?.(body) };
}
