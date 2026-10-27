import { ListPicker } from "@/app/components/ui/ListPicker";
import { ListOptionButton } from "@/app/components/ui/ListOptionButton";
import { ReferenceOptionButton } from "@/app/components/sandbox-chat/ReferenceOptionButton";
import { ReplyButtons } from "@/app/components/ui/ReplyButtons";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { rowPresentation } from "@/app/components/sandbox-chat/menu-rows";
import { splitPagerRows } from "@/lib/utils/list-rows";
import type { ButtonOption, ListRow } from "@/lib/fsm/core/types";
import { referenciaSeleccionText } from "@/lib/constants/textos/cita-reserva";

const SEARCH_THRESHOLD = 5;
const PAGE_SIZE = 5;

export function ChatListPicker({
  rows,
  actions = [],
  disabled = false,
  onSelect,
  onActionSelect = onSelect,
}: {
  rows: ListRow[];
  actions?: ButtonOption[];
  disabled?: boolean;
  onSelect: (id: string, label: string) => void;
  onActionSelect?: (id: string, label: string) => void;
}) {
  const { items, pager } = splitPagerRows(rows);

  return (
    <div className="space-y-2">
      <ListPicker
        items={items}
        pager={pager}
        searchThreshold={SEARCH_THRESHOLD}
        pageSize={PAGE_SIZE}
        presentItem={rowPresentation}
        renderItem={(item, { label, Icon }) => {
          const reference = item.referencia;
          if (reference) {
            return (
              <ReferenceOptionButton
                reference={reference}
                disabled={disabled}
                onClick={() => onSelect(item.id, referenciaSeleccionText(reference.especialidad, reference.numero))}
              />
            );
          }
          return (
            <ListOptionButton
              title={label}
              description={item.description}
              Icon={Icon}
              disabled={disabled}
              onClick={() => onSelect(item.id, label)}
            />
          );
        }}
        disabled={disabled}
        onSelect={onSelect}
      />
      <ReplyButtons buttons={actions} disabled={disabled} variant={ButtonVariant.OUTLINE} onSelect={onActionSelect} />
    </div>
  );
}
