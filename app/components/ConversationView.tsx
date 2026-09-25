"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/app/components/types";

const POLL_INTERVAL_MS = 4000;

export default function ConversationView({
  conversationId,
  profileName,
  waId,
  onBack,
}: {
  conversationId: string;
  profileName?: string | null;
  waId?: string;
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [windowOpen, setWindowOpen] = useState(true);
  const [windowExpiresAt, setWindowExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Message[];
          windowOpen: boolean;
          windowExpiresAt: string | null;
          status: "OPEN" | "CLOSED";
        };
        if (!cancelled) {
          setMessages(data.messages);
          setWindowOpen(data.windowOpen);
          setWindowExpiresAt(data.windowExpiresAt);
          setStatus(data.status);
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
        setSendError(data.message ?? "No se pudo enviar el mensaje.");
        return;
      }

      const created = (await res.json()) as Message;
      setMessages((prev) => [...prev, created]);
      setText("");
    } catch {
      setSendError("No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setCloseError(null);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/close`, { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCloseError(data.message ?? "No se pudo cerrar la conversación.");
        return;
      }

      setStatus("CLOSED");
    } catch {
      setCloseError("No se pudo cerrar la conversación.");
    } finally {
      setClosing(false);
    }
  }

  const displayName = profileName ?? waId ?? "Contacto";

  // Recomputed from the already-fetched windowExpiresAt on every render
  // (i.e. every 4s poll cycle) — no separate timer needed.
  const countdown =
    windowOpen && windowExpiresAt ? formatWindowCountdown(windowExpiresAt) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 bg-[var(--wa-header)] px-4 py-2.5 text-white">
        {onBack && (
          <button
            type="button"
            aria-label="Volver"
            onClick={onBack}
            className="flex-shrink-0 text-white/90 hover:text-white"
          >
            <BackArrowIcon className="h-5 w-5" />
          </button>
        )}
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
          <PersonIcon className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="truncate text-xs text-white/80">Cuenta oficial</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {status === "OPEN" ? (
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="rounded-full border border-white/40 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-50"
            >
              {closing ? "Cerrando…" : "Cerrar conversación"}
            </button>
          ) : (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white/90">
              Cerrada
            </span>
          )}
          <DotsMenuIcon className="h-5 w-5 text-white/90" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-[var(--wa-panel-bg)] px-4 py-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-2 flex ${
              message.direction === "OUTBOUND" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${
                message.direction === "OUTBOUND"
                  ? "rounded-tr-none bg-[var(--wa-bubble-out)] text-gray-900"
                  : "rounded-tl-none bg-[var(--wa-bubble-in)] text-gray-900"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content ?? `[${message.type}]`}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {message.direction === "OUTBOUND" && <ReadTicksIcon status={message.status} />}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {countdown && (
        <div
          className={`px-4 pt-1.5 text-xs ${
            countdown.warning ? "text-amber-600" : "text-gray-500"
          }`}
        >
          {countdown.label}
        </div>
      )}

      {status === "CLOSED" && (
        <div className="border-t border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          Esta conversación está cerrada.
        </div>
      )}

      {status === "OPEN" && !windowOpen && (
        <div className="border-t border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          La ventana de 24 horas está cerrada — envía un mensaje de plantilla aprobado en lugar de
          texto libre.
        </div>
      )}

      {sendError && (
        <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {sendError}
        </div>
      )}

      {closeError && (
        <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {closeError}
        </div>
      )}

      <div className="flex items-center gap-2 bg-[var(--wa-footer-bg)] px-3 py-2">
        <EmojiIcon className="h-6 w-6 flex-shrink-0 text-gray-500" />
        <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={status === "CLOSED" || !windowOpen || sending}
            placeholder={
              status === "CLOSED"
                ? "Conversación cerrada"
                : windowOpen
                  ? "Escribe un mensaje"
                  : "Ventana de 24h cerrada"
            }
            className="flex-1 border-none bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          />
          <PaperclipIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
          <CameraIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
        </div>
        <button
          onClick={handleSend}
          disabled={status === "CLOSED" || !windowOpen || sending || !text.trim()}
          aria-label="Enviar mensaje"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--wa-accent)] text-white transition-opacity disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// Derives the remaining time until windowExpiresAt from Date.now() — called
// on every render (i.e. every 4s poll cycle), no dedicated timer needed.
function formatWindowCountdown(windowExpiresAt: string): { label: string; warning: boolean } | null {
  const remainingMs = new Date(windowExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const warning = remainingMs < 60 * 60 * 1000;

  return {
    label: `Ventana de 24h: quedan ${hours}h ${minutes}m para responder libremente`,
    warning,
  };
}

function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 001 1h14a1 1 0 001-1v-1c0-2.76-3.58-5-8-5z" />
    </svg>
  );
}

function DotsMenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function EmojiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2" />
      <path d="M9 9h.01M15 9h.01" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 01-7.78-7.78l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a1.5 1.5 0 01-2.12-2.12l8.49-8.48" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
    </svg>
  );
}

function ReadTicksIcon({ status }: { status: Message["status"] }) {
  const colorClass = status === "READ" ? "text-sky-500" : "text-gray-400";
  return (
    <svg
      viewBox="0 0 24 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-4 ${colorClass}`}
      aria-hidden="true"
    >
      <path d="M1 8l4 4L14 3" />
      <path d="M9 8l4 4L22 3" />
    </svg>
  );
}
