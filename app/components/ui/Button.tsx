import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import type { ButtonWidth } from "@/lib/enums/button-width";
import { buttonClassName } from "@/lib/utils/button-class-name";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  loading?: boolean;
  loadingLabel?: ReactNode;
  selected?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};

export function Button({
  variant = ButtonVariant.PRIMARY,
  size,
  width,
  loading = false,
  loadingLabel,
  selected = false,
  iconStart,
  iconEnd,
  className,
  disabled,
  children,
  ...nativeProps
}: ButtonProps) {
  const withIcon = iconStart !== undefined || iconEnd !== undefined;
  const classes = buttonClassName({ variant, size, width, withIcon, selected, className });

  return (
    <button type="button" {...nativeProps} disabled={disabled || loading} className={classes || undefined}>
      {iconStart}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
      {iconEnd}
    </button>
  );
}
