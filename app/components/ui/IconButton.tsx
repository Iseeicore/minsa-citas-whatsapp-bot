import type { ReactNode } from "react";

export function IconButton({
  icon,
  onClick,
  ariaLabel,
  variant = "ghost",
  size = "h-5 w-5",
  toneClassName = "text-white/80 hover:text-white",
  hitAreaClassName = "",
  disabled,
}: {
  icon: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  variant?: "ghost" | "solid";
  size?: string;
  toneClassName?: string;
  hitAreaClassName?: string;
  disabled?: boolean;
}) {
  if (variant === "solid") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`flex ${size} flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40 ${toneClassName}`}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex-shrink-0 ${toneClassName} ${hitAreaClassName}`}
    >
      {icon}
    </button>
  );
}
