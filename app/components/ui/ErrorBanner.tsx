import type { ReactNode } from "react";

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
      {children}
    </div>
  );
}
