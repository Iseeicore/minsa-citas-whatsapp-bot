import type { ComponentType } from "react";
import { ChevronRightIcon } from "@/app/components/icons";
import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";

export function ListOptionButton({
  title,
  description,
  Icon,
  disabled = false,
  onClick,
}: {
  title: string;
  description?: string;
  Icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant={ButtonVariant.LIST_OPTION} width={ButtonWidth.FULL} disabled={disabled} onClick={onClick}>
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {description && <span className="block text-xs text-white/80">{description}</span>}
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/60" />
    </Button>
  );
}
