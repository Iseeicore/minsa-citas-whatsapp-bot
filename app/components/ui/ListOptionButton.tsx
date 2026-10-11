import type { ComponentType } from "react";
import { ChevronRightIcon } from "@/app/components/icons";

export function ListOptionButton({
  title,
  description,
  Icon,
  onClick,
}: {
  title: string;
  description?: string;
  Icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl bg-sb-navy px-3 py-2.5 text-left text-white transition-colors hover:bg-sb-navy-dark"
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {description && <span className="block text-xs text-white/80">{description}</span>}
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/60" />
    </button>
  );
}
