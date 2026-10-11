import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { PagerDirection } from "@/lib/enums/pager-direction";
import { normalizeText } from "@/lib/fsm/parsing/text/text";
import type { ListRow } from "@/lib/fsm/core/types";

export type PagerAction = Pick<ListRow, "id" | "title">;

export type ListPager = {
  prev?: PagerAction;
  next?: PagerAction;
  label?: string;
};

const PREV_IDS: ReadonlySet<string> = new Set([ListPageButtonId.PREV, HoraPageButtonId.PREV, EstablecimientoPageRowId.PREV]);
const PAGER_BUTTON_IDS: ReadonlySet<string> = new Set([
  ListPageButtonId.PREV,
  ListPageButtonId.NEXT,
  HoraPageButtonId.PREV,
  HoraPageButtonId.NEXT,
]);

const PAGE_LABEL = /P[áa]gina\s+(\d+)\s+de\s+(\d+)/i;

export function filterRows(rows: ListRow[], query: string): ListRow[] {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return rows;

  return rows.filter((row) => {
    const haystack = normalizeText(`${row.title} ${row.description ?? ""}`);
    return tokens.every((token) => haystack.includes(token));
  });
}

const toAction = (row: ListRow | undefined): PagerAction | undefined =>
  row ? { id: row.id, title: row.title } : undefined;

/** El MINSA pagina los establecimientos con filas «anterior/siguiente» cuya descripción apunta a la página destino; de ahí se deduce la página actual. */
function currentPageLabel(prevRow: ListRow | undefined, nextRow: ListRow | undefined): string | undefined {
  const source = nextRow ?? prevRow;
  const match = source?.description ? PAGE_LABEL.exec(source.description) : null;
  if (!match) return undefined;

  const target = Number(match[1]);
  const total = Number(match[2]);
  const current = nextRow ? target - 1 : target + 1;
  return `Página ${current} de ${total}`;
}

export function splitPagerRows(rows: ListRow[]): { items: ListRow[]; pager?: ListPager } {
  const prevRow = rows.find((row) => row.id === EstablecimientoPageRowId.PREV);
  const nextRow = rows.find((row) => row.id === EstablecimientoPageRowId.NEXT);
  const items = rows.filter((row) => row !== prevRow && row !== nextRow);

  if (!prevRow && !nextRow) return { items };
  return { items, pager: { prev: toAction(prevRow), next: toAction(nextRow), label: currentPageLabel(prevRow, nextRow) } };
}

export function paginateRows<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  return { rows: rows.slice(current * size, current * size + size), page: current, totalPages };
}

export function isPagerButtonSet<T extends { id: string }>(buttons: T[]): boolean {
  return buttons.length > 0 && buttons.every((button) => PAGER_BUTTON_IDS.has(button.id));
}

export function pagerDirection(id: string): PagerDirection {
  return PREV_IDS.has(id) ? PagerDirection.PREV : PagerDirection.NEXT;
}
