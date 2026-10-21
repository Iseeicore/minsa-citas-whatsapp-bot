import type { ComponentType } from "react";
import { ChevronRightIcon } from "@/app/components/icons";
import { Button } from "@/app/components/ui/Button";
import { ToneChip } from "@/app/components/ui/ToneChip";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { ReferenciaTono } from "@/lib/enums/referencia-tono";

export function ListOptionButton({
  title,
  description,
  Icon,
  tone,
  unavailable = false,
  disabled = false,
  onClick,
}: {
  title: string;
  description?: string;
  Icon?: ComponentType<{ className?: string }>;
  tone?: ReferenciaTono;
  unavailable?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={unavailable ? ButtonVariant.LIST_OPTION_MUTED : ButtonVariant.LIST_OPTION}
      width={ButtonWidth.FULL}
      disabled={disabled || unavailable}
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : onClick}
    >
      {tone && <ToneChip tone={tone} />}
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {description && <span className={unavailable ? "block text-xs" : "block text-xs text-white/80"}>{description}</span>}
      </span>
      {!unavailable && <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/60" />}
    </Button>
  );
}
