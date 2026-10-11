import type { ReactNode } from "react";

export function OptionButton({
  onClick,
  block = false,
  className = "",
  children,
}: {
  onClick?: () => void;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const sizeClassName = block
    ? "flex w-full items-center justify-center gap-2 px-3 py-2 text-sm"
    : "px-3 py-1.5 text-xs";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border border-sb-navy bg-sb-navy font-semibold text-white transition-colors hover:bg-sb-navy-dark ${sizeClassName} ${className}`}
    >
      {children}
    </button>
  );
}
