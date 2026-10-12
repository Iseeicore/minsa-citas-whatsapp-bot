import type { ReactNode } from "react";
import { BotAvatarBadge } from "@/app/components/ui/BotAvatarBadge";

export function BotMessageRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <BotAvatarBadge />
      {children}
    </div>
  );
}
