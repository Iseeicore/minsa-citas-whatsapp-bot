"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "@/app/components/types";
import { Badge } from "@/app/components/ui/Badge";
import { avatarColor, initials } from "@/lib/utils/avatar";

const POLL_INTERVAL_MS = 4000;

export default function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const data = (await res.json()) as Conversation[];
        if (!cancelled) setConversations(data);
      } catch {
      }
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
      {conversations.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-gray-400">Aún no hay conversaciones.</p>
      )}
      <ul>
        {conversations.map((conversation) => {
          const label = conversation.profileName ?? conversation.waId;
          const active = selectedId === conversation.id;
          return (
            <li key={conversation.id}>
              <button
                onClick={() => onSelect(conversation)}
                className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                  active ? "bg-teal-50" : ""
                }`}
              >
                <span
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(
                    conversation.waId,
                  )}`}
                >
                  {initials(label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{label}</span>
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {new Date(conversation.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">{conversation.waId}</span>
                    <Badge
                      className={
                        conversation.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {conversation.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
