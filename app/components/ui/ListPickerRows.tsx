import { Fragment } from "react";
import { ListOptionButton } from "@/app/components/ui/ListOptionButton";
import type { ListItemPresentation, ListItemRenderer } from "@/app/components/ui/list-picker-types";
import type { ListRow } from "@/lib/fsm/core/types";

export function ListPickerRows({
  rows,
  presentItem,
  renderItem,
  disabled,
  onSelect,
}: {
  rows: ListRow[];
  presentItem: (item: ListRow) => ListItemPresentation;
  renderItem?: ListItemRenderer;
  disabled: boolean;
  onSelect: (id: string, label: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((item) => {
        const { label, Icon } = presentItem(item);
        return (
          <Fragment key={item.id}>
            {renderItem ? (
              renderItem(item, { label, Icon })
            ) : (
              <ListOptionButton
                title={label}
                description={item.description}
                Icon={Icon}
                disabled={disabled}
                onClick={() => onSelect(item.id, label)}
              />
            )}
          </Fragment>
        );
      })}
      {rows.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500">No hay opciones que coincidan con tu búsqueda.</p>}
    </div>
  );
}
