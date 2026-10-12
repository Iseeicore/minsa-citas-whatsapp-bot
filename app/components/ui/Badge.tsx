import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({
  size = "sm",
  className,
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-full text-xs font-medium",
        size === "md" ? "px-3 py-1" : "px-1.5 py-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}
