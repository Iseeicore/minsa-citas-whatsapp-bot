"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "./types";

const POLL_INTERVAL_MS = 4000;

const AVATAR_COLORS = [
  "bg-teal-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-emerald-500",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

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
        // Ignore transient network errors; next poll will retry.
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
                    <span className="flex-shrink-0 text-[11px] text-gray-400">
                      {new Date(conversation.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">{conversation.waId}</span>
                    <span
                      className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        conversation.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {conversation.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </span>
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
