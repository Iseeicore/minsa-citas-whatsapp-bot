import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Avatar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm text-white", className)}
    >
      {children}
    </span>
  );
}
