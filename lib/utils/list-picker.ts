import { LocalPageAction } from "@/lib/enums/local-page-action";
import { filterRows, paginateRows, type ListPager } from "@/lib/utils/list-rows";
import type { ListRow } from "@/lib/fsm/core/types";

export type ListPickerView = {
  rows: ListRow[];
  showSearch: boolean;
  page: number;
  pager?: ListPager;
};

export function localPager(page: number, totalPages: number): ListPager | undefined {
  if (totalPages <= 1) return undefined;

  return {
    prev: page > 0 ? { id: LocalPageAction.PREV, title: "Anteriores" } : undefined,
    next: page < totalPages - 1 ? { id: LocalPageAction.NEXT, title: "Siguientes" } : undefined,
    label: `Página ${page + 1} de ${totalPages}`,
  };
}

export function buildListPickerView({
  items,
  query,
  page,
  pageSize,
  searchThreshold,
  externalPager,
}: {
  items: ListRow[];
  query: string;
  page: number;
  pageSize: number;
  searchThreshold: number;
  externalPager?: ListPager;
}): ListPickerView {
  const filtered = filterRows(items, query);
  const showSearch = items.length > searchThreshold;

  if (externalPager) return { rows: filtered, showSearch, page: 0, pager: externalPager };

  const paged = paginateRows(filtered, page, pageSize);
  return { rows: paged.rows, showSearch, page: paged.page, pager: localPager(paged.page, paged.totalPages) };
}

export function localPageTarget(actionId: string, page: number): number | undefined {
  if (actionId === LocalPageAction.PREV) return page - 1;
  if (actionId === LocalPageAction.NEXT) return page + 1;
  return undefined;
}
