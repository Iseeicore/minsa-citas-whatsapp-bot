"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "@/app/components/types";
import { Avatar } from "@/app/components/ui/Avatar";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { avatarColor, initials } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils/cn";
import { formatClockTime } from "@/lib/utils/format-clock-time";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { BannerTone } from "@/lib/enums/banner-tone";
import { Banner } from "@/app/components/ui/Banner";
import { fetchJson } from "@/lib/utils/fetch-json";
import { FetchJsonStatus } from "@/lib/enums/fetch-json-status";

const POLL_INTERVAL_MS = 4000;

export default function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchJson<Conversation[]>(
        "/api/conversations",
        "No se pudieron cargar las conversaciones. La lista puede no estar al día.",
      );
      if (cancelled) return;
      if (result.status === FetchJsonStatus.FAILED) {
        setLoadError(result.message);
        return;
      }
      setLoadError(null);
      setConversations(result.data);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <h2 className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Conversaciones
      </h2>
      {loadError && <Banner tone={BannerTone.ERROR}>{loadError}</Banner>}
      {!loadError && conversations.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-gray-400">Aún no hay conversaciones.</p>
      )}
      <ul>
        {conversations.map((conversation) => {
          const label = conversation.profileName ?? conversation.waId;
          const active = selectedId === conversation.id;
          return (
            <li key={conversation.id}>
              <Button
                variant={ButtonVariant.ROW}
                width={ButtonWidth.FULL}
                selected={active}
                onClick={() => onSelect(conversation)}
              >
                <Avatar className={cn("font-semibold", avatarColor(conversation.waId))}>{initials(label)}</Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{label}</span>
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {formatClockTime(conversation.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">{conversation.waId}</span>
                    <Badge
                      className={
                        conversation.status === ConversationStatus.OPEN
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {conversation.status === ConversationStatus.OPEN ? "Abierta" : "Cerrada"}
                    </Badge>
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
