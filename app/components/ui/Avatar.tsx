import type { ReactNode } from "react";

export function Avatar({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm text-white ${className}`.trim()}
    >
      {children}
    </span>
  );
}
