"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "./types";

const POLL_INTERVAL_MS = 4000;

export default function ConversationView({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [windowOpen, setWindowOpen] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Message[]; windowOpen: boolean };
        if (!cancelled) {
          setMessages(data.messages);
          setWindowOpen(data.windowOpen);
        }
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
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSendError(data.message ?? "Failed to send message.");
        return;
      }

      const created = (await res.json()) as Message;
      setMessages((prev) => [...prev, created]);
      setText("");
    } catch {
      setSendError("Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-2 flex ${
              message.direction === "OUTBOUND" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                message.direction === "OUTBOUND"
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-900"
              }`}
            >
              <div>{message.content ?? `[${message.type}]`}</div>
              <div className="mt-1 text-[10px] opacity-70">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {!windowOpen && (
        <div className="border-t border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          The 24-hour window is closed — send an approved template message instead of free text.
        </div>
      )}

      {sendError && (
        <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {sendError}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-gray-200 p-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          disabled={!windowOpen || sending}
          placeholder={windowOpen ? "Type a message" : "24-hour window closed"}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
        />
        <button
          onClick={handleSend}
          disabled={!windowOpen || sending || !text.trim()}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
        >
          Send
        </button>
      </div>
    </div>
  );
}
