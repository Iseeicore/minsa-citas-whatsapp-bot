import { useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { ListPickerRows } from "@/app/components/ui/ListPickerRows";
import type { ListItemPresentation, ListPickerProps } from "@/app/components/ui/list-picker-types";
import { ListPickerSearch } from "@/app/components/ui/ListPickerSearch";
import { PagerBar } from "@/app/components/ui/PagerBar";
import { buildListPickerView, localPageTarget } from "@/lib/utils/list-picker";
import type { ListRow } from "@/lib/fsm/core/types";

export type { ListItemPresentation } from "@/app/components/ui/list-picker-types";

const plainPresentation = (item: ListRow): ListItemPresentation => ({ label: item.title });

export function ListPicker({
  items,
  searchThreshold,
  pageSize,
  onSelect,
  pager: externalPager,
  presentItem = plainPresentation,
  renderItem,
  disabled = false,
}: ListPickerProps) {
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
        <ListPickerSearch
          query={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
      )}

      <ListPickerRows rows={view.rows} presentItem={presentItem} renderItem={renderItem} disabled={disabled} onSelect={onSelect} />

      {view.pager && (
        <div className="border-t border-sb-bubble-border pt-2">
          <PagerBar
            prev={view.pager.prev}
            next={view.pager.next}
            label={view.pager.label}
            disabled={disabled}
            onSelect={handlePagerSelect}
          />
        </div>
      )}
    </Card>
  );
}
