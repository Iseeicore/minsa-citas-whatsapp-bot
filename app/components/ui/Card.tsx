import type { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-sb-bubble-border bg-white shadow-sm ${className}`.trim()}>{children}</div>
  );
}
