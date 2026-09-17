"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "./types";

const POLL_INTERVAL_MS = 4000;

export default function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
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
    <div className="flex h-full flex-col overflow-y-auto border-r border-gray-200">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">
        Conversations
      </h2>
      {conversations.length === 0 && (
        <p className="px-4 py-3 text-sm text-gray-400">No conversations yet.</p>
      )}
      <ul>
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <button
              onClick={() => onSelect(conversation.id)}
              className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
                selectedId === conversation.id ? "bg-gray-100" : ""
              }`}
            >
              <div className="font-medium text-gray-900">
                {conversation.profileName ?? conversation.waId}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(conversation.lastMessageAt).toLocaleString()}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
