"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/app/components/types";
import {
  BackArrowIcon,
  CameraIcon,
  DotsMenuIcon,
  EmojiIcon,
  PaperclipIcon,
  PersonIcon,
  ReadTicksIcon,
  SendIcon,
} from "@/app/components/icons";
import { IconButton } from "@/app/components/ui/IconButton";
import { Badge } from "@/app/components/ui/Badge";
import { ErrorBanner } from "@/app/components/ui/ErrorBanner";
import { formatWindowCountdown } from "@/lib/utils/format-window-countdown";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { MessageDirection } from "@/lib/enums/message-direction";

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
  const [status, setStatus] = useState<ConversationStatus>(ConversationStatus.OPEN);
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
          status: ConversationStatus;
        };
        if (!cancelled) {
          setMessages(data.messages);
          setWindowOpen(data.windowOpen);
          setWindowExpiresAt(data.windowExpiresAt);
          setStatus(data.status);
        }
      } catch {
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

      setStatus(ConversationStatus.CLOSED);
    } catch {
      setCloseError("No se pudo cerrar la conversación.");
    } finally {
      setClosing(false);
    }
  }

  const displayName = profileName ?? waId ?? "Contacto";

  const countdown =
    windowOpen && windowExpiresAt ? formatWindowCountdown(windowExpiresAt) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 bg-wa-header px-4 py-2.5 text-white">
        {onBack && (
          <IconButton
            icon={<BackArrowIcon className="h-5 w-5" />}
            onClick={onBack}
            ariaLabel="Volver"
            toneClassName="text-white/90 hover:text-white"
          />
        )}
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
          <PersonIcon className="h-6 w-6 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="truncate text-xs text-white/80">Cuenta oficial</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {status === ConversationStatus.OPEN ? (
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="rounded-full border border-white/40 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-50"
            >
              {closing ? "Cerrando…" : "Cerrar conversación"}
            </button>
          ) : (
            <Badge size="md" className="bg-white/20 text-white/90">Cerrada</Badge>
          )}
          <DotsMenuIcon className="h-5 w-5 text-white/90" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-wa-panel px-4 py-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-2 flex ${
              message.direction === MessageDirection.OUTBOUND ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${
                message.direction === MessageDirection.OUTBOUND
                  ? "rounded-tr-none bg-wa-bubble-out text-gray-900"
                  : "rounded-tl-none bg-wa-bubble-in text-gray-900"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content ?? `[${message.type}]`}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-gray-500">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {message.direction === MessageDirection.OUTBOUND && (
                  <ReadTicksIcon status={message.status} />
                )}
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

      {status === ConversationStatus.CLOSED && (
        <div className="border-t border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          Esta conversación está cerrada.
        </div>
      )}

      {status === ConversationStatus.OPEN && !windowOpen && (
        <div className="border-t border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          La ventana de 24 horas está cerrada — envía un mensaje de plantilla aprobado en lugar de
          texto libre.
        </div>
      )}

      {sendError && <ErrorBanner>{sendError}</ErrorBanner>}

      {closeError && <ErrorBanner>{closeError}</ErrorBanner>}

      <div className="flex items-center gap-2 bg-wa-footer px-3 py-2">
        <EmojiIcon className="h-6 w-6 flex-shrink-0 text-gray-500" />
        <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={status === ConversationStatus.CLOSED || !windowOpen || sending}
            placeholder={
              status === ConversationStatus.CLOSED
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
        <IconButton
          variant="solid"
          icon={<SendIcon className="h-5 w-5" />}
          onClick={handleSend}
          disabled={status === ConversationStatus.CLOSED || !windowOpen || sending || !text.trim()}
          ariaLabel="Enviar mensaje"
          size="h-10 w-10"
          toneClassName="bg-wa-accent"
        />
      </div>
    </div>
  );
}

