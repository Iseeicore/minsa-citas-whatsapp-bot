import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { cn } from "@/lib/utils/cn";

const ICON_SOLID_SHAPE = "rounded-full text-white transition-opacity disabled:opacity-40";
const STALE_OPTION_STATE = "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT_CLASS_NAME: Record<ButtonVariant, string> = {
  [ButtonVariant.PRIMARY]: "rounded-xl bg-sb-navy font-semibold text-white transition-colors hover:bg-sb-navy-dark",
  [ButtonVariant.OUTLINE]: cn(
    "rounded-xl border border-sb-navy bg-white font-semibold text-sb-navy transition-colors hover:bg-sb-panel",
    STALE_OPTION_STATE,
  ),
  [ButtonVariant.OPTION]: cn(
    "rounded-xl border border-sb-navy bg-sb-navy font-semibold text-white transition-colors hover:bg-sb-navy-dark",
    STALE_OPTION_STATE,
  ),
  [ButtonVariant.LIST_OPTION]: cn("rounded-xl bg-sb-navy text-left text-white transition-colors hover:bg-sb-navy-dark", STALE_OPTION_STATE),
  [ButtonVariant.LIST_OPTION_MUTED]:
    "cursor-not-allowed rounded-xl border border-sb-bubble-border bg-sb-muted text-left text-sb-muted-text",
  [ButtonVariant.ACCENT]: "rounded-lg bg-sb-accent font-medium text-white transition-opacity disabled:opacity-40",
  [ButtonVariant.PILL_ON_DARK]: "rounded-full border border-white/40 font-medium text-white/90 hover:bg-white/10 disabled:opacity-50",
  [ButtonVariant.PILL_NEUTRAL]: "rounded-full border border-gray-300 bg-white font-medium text-gray-600 hover:bg-gray-50",
  [ButtonVariant.ROW]: "border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50",
  [ButtonVariant.ICON_PLAIN]: "text-white/90 hover:text-white",
  [ButtonVariant.ICON_CONTROL]: "rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white",
  [ButtonVariant.ICON_SOLID_NAVY]: cn(ICON_SOLID_SHAPE, "bg-sb-navy hover:bg-sb-navy-dark"),
  [ButtonVariant.ICON_SOLID_WHATSAPP]: cn(ICON_SOLID_SHAPE, "bg-wa-accent"),
  [ButtonVariant.SWITCH_TRACK]: "h-10 rounded-full bg-gray-200 p-1 transition-colors",
  [ButtonVariant.UNSTYLED]: "",
};

const VARIANT_LAYOUT_CLASS_NAME: Partial<Record<ButtonVariant, string>> = {
  [ButtonVariant.OPTION]: "flex items-center justify-center gap-2",
  [ButtonVariant.LIST_OPTION]: "flex items-center gap-2.5",
  [ButtonVariant.LIST_OPTION_MUTED]: "flex items-center gap-2.5",
  [ButtonVariant.ROW]: "flex items-center gap-3",
  [ButtonVariant.ICON_PLAIN]: "flex-shrink-0",
  [ButtonVariant.ICON_CONTROL]: "flex-shrink-0",
  [ButtonVariant.ICON_SOLID_NAVY]: "flex flex-shrink-0 items-center justify-center",
  [ButtonVariant.ICON_SOLID_WHATSAPP]: "flex flex-shrink-0 items-center justify-center",
  [ButtonVariant.SWITCH_TRACK]: "relative flex items-center",
  [ButtonVariant.UNSTYLED]: "",
};

const SELECTED_CLASS_NAME: Partial<Record<ButtonVariant, string>> = {
  [ButtonVariant.ROW]: "bg-teal-50",
};

const SIZE_CLASS_NAME: Record<ButtonSize, string> = {
  [ButtonSize.NONE]: "",
  [ButtonSize.XS]: "px-3 py-1 text-xs",
  [ButtonSize.SM]: "px-3 py-1.5 text-xs",
  [ButtonSize.MD]: "px-3 py-2 text-sm",
  [ButtonSize.LG]: "px-3 py-2.5",
  [ButtonSize.ICON_MD]: "h-9 w-9",
  [ButtonSize.ICON_LG]: "h-10 w-10",
};

const ICON_GAP_CLASS_NAME: Record<ButtonSize, string> = {
  [ButtonSize.NONE]: "gap-1",
  [ButtonSize.XS]: "gap-1",
  [ButtonSize.SM]: "gap-1",
  [ButtonSize.MD]: "gap-2",
  [ButtonSize.LG]: "gap-2",
  [ButtonSize.ICON_MD]: "",
  [ButtonSize.ICON_LG]: "",
};

const WIDTH_CLASS_NAME: Record<ButtonWidth, string> = {
  [ButtonWidth.AUTO]: "",
  [ButtonWidth.FULL]: "w-full",
  [ButtonWidth.GROW]: "flex-1",
};

const DEFAULT_SIZE: Record<ButtonVariant, ButtonSize> = {
  [ButtonVariant.PRIMARY]: ButtonSize.MD,
  [ButtonVariant.OUTLINE]: ButtonSize.MD,
  [ButtonVariant.OPTION]: ButtonSize.MD,
  [ButtonVariant.LIST_OPTION]: ButtonSize.LG,
  [ButtonVariant.LIST_OPTION_MUTED]: ButtonSize.LG,
  [ButtonVariant.ACCENT]: ButtonSize.MD,
  [ButtonVariant.PILL_ON_DARK]: ButtonSize.XS,
  [ButtonVariant.PILL_NEUTRAL]: ButtonSize.XS,
  [ButtonVariant.ROW]: ButtonSize.NONE,
  [ButtonVariant.ICON_PLAIN]: ButtonSize.NONE,
  [ButtonVariant.ICON_CONTROL]: ButtonSize.NONE,
  [ButtonVariant.ICON_SOLID_NAVY]: ButtonSize.ICON_MD,
  [ButtonVariant.ICON_SOLID_WHATSAPP]: ButtonSize.ICON_MD,
  [ButtonVariant.SWITCH_TRACK]: ButtonSize.NONE,
  [ButtonVariant.UNSTYLED]: ButtonSize.NONE,
};

export function defaultButtonSize(variant: ButtonVariant): ButtonSize {
  return DEFAULT_SIZE[variant];
}

function contentLayout(variant: ButtonVariant, size: ButtonSize, withIcon: boolean): string {
  const fixed = VARIANT_LAYOUT_CLASS_NAME[variant];
  if (fixed !== undefined) return fixed;
  if (!withIcon) return "";
  return cn("flex items-center justify-center", ICON_GAP_CLASS_NAME[size]);
}

export function buttonClassName({
  variant,
  size = defaultButtonSize(variant),
  width = ButtonWidth.AUTO,
  withIcon = false,
  selected = false,
  className = "",
}: {
  variant: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  withIcon?: boolean;
  selected?: boolean;
  className?: string;
}): string {
  return cn(
    WIDTH_CLASS_NAME[width],
    contentLayout(variant, size, withIcon),
    VARIANT_CLASS_NAME[variant],
    SIZE_CLASS_NAME[size],
    selected && SELECTED_CLASS_NAME[variant],
    className,
  );
}
