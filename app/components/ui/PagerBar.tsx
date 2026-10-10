import { ChevronLeftIcon, ChevronRightIcon } from "@/app/components/icons";
import { PagerDirection } from "@/lib/enums/pager-direction";
import type { PagerAction } from "@/lib/utils/list-rows";

function PagerButton({
  action,
  direction,
  onSelect,
}: {
  action: PagerAction;
  direction: PagerDirection;
  onSelect: (id: string, title: string) => void;
}) {
  const isPrev = direction === PagerDirection.PREV;
  const Chevron = isPrev ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <button
      type="button"
      onClick={() => onSelect(action.id, action.title)}
      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-sb-navy bg-white px-3 py-1.5 text-xs font-semibold text-sb-navy transition-colors hover:bg-sb-panel"
    >
      {isPrev && <Chevron className="h-3.5 w-3.5 shrink-0" />}
      {action.title}
      {!isPrev && <Chevron className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

export function PagerBar({
  prev,
  next,
  label,
  onSelect,
}: {
  prev?: PagerAction;
  next?: PagerAction;
  label?: string;
  onSelect: (id: string, title: string) => void;
}) {
  return (
    <div className="space-y-2">
      {label && <p className="text-center text-xs font-medium text-slate-500">{label}</p>}
      <div className="flex gap-2">
        {prev && <PagerButton action={prev} direction={PagerDirection.PREV} onSelect={onSelect} />}
        {next && <PagerButton action={next} direction={PagerDirection.NEXT} onSelect={onSelect} />}
      </div>
    </div>
  );
}
