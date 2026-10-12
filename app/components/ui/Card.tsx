import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-sb-bubble-border bg-white shadow-sm", className)}>{children}</div>;
}
