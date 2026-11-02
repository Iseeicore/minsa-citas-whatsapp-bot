import type { ComponentProps } from "react";
import type { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import type { ButtonWidth } from "@/lib/enums/button-width";
import { buttonClassName } from "@/lib/utils/button-class-name";

export function AnchorLink({
  variant = ButtonVariant.UNSTYLED,
  size,
  width,
  selected,
  className,
  ...anchorProps
}: Omit<ComponentProps<"a">, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  selected?: boolean;
  className?: string;
}) {
  return <a {...anchorProps} className={buttonClassName({ variant, size, width, selected, className }) || undefined} />;
}
