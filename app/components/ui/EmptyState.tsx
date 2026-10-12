import type { ReactNode } from "react";

export function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-wa-panel text-sm text-gray-500">
      {icon}
      <p>{children}</p>
    </div>
  );
}
