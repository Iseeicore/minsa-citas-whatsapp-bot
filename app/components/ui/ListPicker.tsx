import { useState, type ComponentType } from "react";
import { SearchIcon } from "@/app/components/icons";
import { Card } from "@/app/components/ui/Card";
import { ListOptionButton } from "@/app/components/ui/ListOptionButton";
import { PagerBar } from "@/app/components/ui/PagerBar";
import { TextInput } from "@/app/components/ui/TextInput";
import { TextInputVariant } from "@/lib/enums/text-input-variant";
import { buildListPickerView, localPageTarget } from "@/lib/utils/list-picker";
import type { ListPager } from "@/lib/utils/list-rows";
import type { ListRow } from "@/lib/fsm/core/types";

export type ListItemPresentation = { label: string; Icon?: ComponentType<{ className?: string }> };

const plainPresentation = (item: ListRow): ListItemPresentation => ({ label: item.title });

export function ListPicker({
  items,
  searchThreshold,
  pageSize,
  onSelect,
  pager: externalPager,
  presentItem = plainPresentation,
}: {
  items: ListRow[];
  searchThreshold: number;
  pageSize: number;
  onSelect: (id: string, label: string) => void;
  pager?: ListPager;
  presentItem?: (item: ListRow) => ListItemPresentation;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const view = buildListPickerView({ items, query, page, pageSize, searchThreshold, externalPager });

  function handlePagerSelect(id: string, title: string) {
    const target = localPageTarget(id, view.page);
    if (target === undefined) onSelect(id, title);
    else setPage(target);
  }

  return (
    <Card className="space-y-2 p-2">
      {view.showSearch && (
        <label className="flex items-center gap-2 rounded-xl border border-sb-bubble-border bg-sb-panel px-3 py-1.5 transition-colors focus-within:border-sb-navy focus-within:bg-white">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <TextInput
            variant={TextInputVariant.SEARCH}
            type="search"
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setPage(0);
            }}
            placeholder="Buscar en la lista…"
            aria-label="Buscar en la lista"
          />
        </label>
      )}

      <div className="space-y-1.5">
        {view.rows.map((item) => {
          const { label, Icon } = presentItem(item);
          return (
            <ListOptionButton
              key={item.id}
              title={label}
              description={item.description}
              Icon={Icon}
              onClick={() => onSelect(item.id, label)}
            />
          );
        })}
        {view.rows.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-slate-500">No hay opciones que coincidan con tu búsqueda.</p>
        )}
      </div>

      {view.pager && (
        <div className="border-t border-sb-bubble-border pt-2">
          <PagerBar prev={view.pager.prev} next={view.pager.next} label={view.pager.label} onSelect={handlePagerSelect} />
        </div>
      )}
    </Card>
  );
}
