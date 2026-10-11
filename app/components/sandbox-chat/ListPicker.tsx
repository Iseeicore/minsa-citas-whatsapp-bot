import { useState } from "react";
import { SearchIcon } from "@/app/components/icons";
import { ListOptionButton } from "@/app/components/ui/ListOptionButton";
import { PagerBar } from "@/app/components/ui/PagerBar";
import { rowPresentation } from "@/app/components/sandbox-chat/menu-rows";
import { LocalPageAction } from "@/lib/enums/local-page-action";
import { filterRows, paginateRows, splitPagerRows, type ListPager } from "@/lib/utils/list-rows";
import type { ListRow } from "@/lib/fsm/core/types";

const FILTER_MIN_ITEMS = 5;
const LIST_PAGE_SIZE = 5;

export function ListPicker({
  rows,
  onSelect,
}: {
  rows: ListRow[];
  onSelect: (id: string, label: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const { items, pager: minsaPager } = splitPagerRows(rows);
  const filtered = filterRows(items, filter);
  const paged = minsaPager ? { rows: filtered, page: 0, totalPages: 1 } : paginateRows(filtered, page, LIST_PAGE_SIZE);
  const visible = paged.rows;

  const localPager: ListPager | undefined =
    paged.totalPages > 1
      ? {
          prev: paged.page > 0 ? { id: LocalPageAction.PREV, title: "Anteriores" } : undefined,
          next: paged.page < paged.totalPages - 1 ? { id: LocalPageAction.NEXT, title: "Siguientes" } : undefined,
          label: `Página ${paged.page + 1} de ${paged.totalPages}`,
        }
      : undefined;
  const pager = minsaPager ?? localPager;

  function handlePagerSelect(id: string, title: string) {
    if (id === LocalPageAction.PREV) setPage(paged.page - 1);
    else if (id === LocalPageAction.NEXT) setPage(paged.page + 1);
    else onSelect(id, title);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-sb-bubble-border bg-white p-2 shadow-sm">
      {items.length > FILTER_MIN_ITEMS && (
        <label className="flex items-center gap-2 rounded-xl border border-sb-bubble-border bg-sb-panel px-3 py-1.5 transition-colors focus-within:border-sb-navy focus-within:bg-white">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
            placeholder="Buscar en la lista…"
            aria-label="Buscar en la lista"
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </label>
      )}

      <div className="space-y-1.5">
        {visible.map((row) => {
          const { label, Icon } = rowPresentation(row);
          return (
            <ListOptionButton
              key={row.id}
              title={label}
              description={row.description}
              Icon={Icon}
              onClick={() => onSelect(row.id, label)}
            />
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-slate-500">No hay opciones que coincidan con tu búsqueda.</p>
        )}
      </div>

      {pager && (
        <div className="border-t border-sb-bubble-border pt-2">
          <PagerBar prev={pager.prev} next={pager.next} label={pager.label} onSelect={handlePagerSelect} />
        </div>
      )}
    </div>
  );
}
