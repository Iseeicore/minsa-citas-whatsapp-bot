import { ListPicker } from "@/app/components/ui/ListPicker";
import { rowPresentation } from "@/app/components/sandbox-chat/menu-rows";
import { splitPagerRows } from "@/lib/utils/list-rows";
import type { ListRow } from "@/lib/fsm/core/types";

const SEARCH_THRESHOLD = 5;
const PAGE_SIZE = 5;

export function ChatListPicker({
  rows,
  disabled = false,
  onSelect,
}: {
  rows: ListRow[];
  disabled?: boolean;
  onSelect: (id: string, label: string) => void;
}) {
  const { items, pager } = splitPagerRows(rows);

  return (
    <ListPicker
      items={items}
      pager={pager}
      searchThreshold={SEARCH_THRESHOLD}
      pageSize={PAGE_SIZE}
      presentItem={rowPresentation}
      disabled={disabled}
      onSelect={onSelect}
    />
  );
}
