import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";
import type { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";

type IconButtonVariant =
  | ButtonVariant.ICON_PLAIN
  | ButtonVariant.ICON_CONTROL
  | ButtonVariant.ICON_SOLID_NAVY
  | ButtonVariant.ICON_SOLID_WHATSAPP;

type IconButtonSize = ButtonSize.ICON_MD | ButtonSize.ICON_LG;

export function IconButton({
  icon,
  onClick,
  ariaLabel,
  variant = ButtonVariant.ICON_CONTROL,
  size,
  disabled,
}: {
  icon: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
}) {
  return (
    <Button variant={variant} size={size} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {icon}
    </Button>
  );
}
