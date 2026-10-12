import { ChevronLeftIcon, ChevronRightIcon } from "@/app/components/icons";
import { Button } from "@/app/components/ui/Button";
import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { PagerDirection } from "@/lib/enums/pager-direction";
import type { PagerAction } from "@/lib/utils/list-rows";

const CHEVRON_CLASS_NAME = "h-3.5 w-3.5 shrink-0";

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

  return (
    <Button
      variant={ButtonVariant.OUTLINE}
      size={ButtonSize.SM}
      width={ButtonWidth.GROW}
      onClick={() => onSelect(action.id, action.title)}
      iconStart={isPrev ? <ChevronLeftIcon className={CHEVRON_CLASS_NAME} /> : undefined}
      iconEnd={isPrev ? undefined : <ChevronRightIcon className={CHEVRON_CLASS_NAME} />}
    >
      {action.title}
    </Button>
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
