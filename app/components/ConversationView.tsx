"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationMessages, Message } from "@/app/components/types";
import { useApi } from "@/app/hooks/use-api";
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
import { Banner } from "@/app/components/ui/Banner";
import { Button } from "@/app/components/ui/Button";
import { TextInput } from "@/app/components/ui/TextInput";
import { cn } from "@/lib/utils/cn";
import { formatClockTime } from "@/lib/utils/format-clock-time";
import { formatWindowCountdown } from "@/lib/utils/format-window-countdown";
import { BannerTone } from "@/lib/enums/banner-tone";
import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { MessageDirection } from "@/lib/enums/message-direction";
import { TextInputVariant } from "@/lib/enums/text-input-variant";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import { BANDEJA_CLOSE_ERROR_TEXT, BANDEJA_LOAD_ERROR_TEXT, BANDEJA_SEND_ERROR_TEXT } from "@/lib/constants/textos/bandeja";

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
  const messagesApi = useApi<ConversationMessages>(BANDEJA_LOAD_ERROR_TEXT);
  const sendApi = useApi<Message>(BANDEJA_SEND_ERROR_TEXT);
  const closeApi = useApi<unknown>(BANDEJA_CLOSE_ERROR_TEXT);
  const sending = sendApi.state.status === ApiRequestStatus.LOADING;
  const sendError = sendApi.state.status === ApiRequestStatus.ERROR ? sendApi.state.message : null;
  const closing = closeApi.state.status === ApiRequestStatus.LOADING;
  const closeError = closeApi.state.status === ApiRequestStatus.ERROR ? closeApi.state.message : null;
  const loadMessages = messagesApi.get;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await loadMessages(`/api/conversations/${conversationId}/messages`);
      if (cancelled || result.status !== ApiRequestStatus.DATA) return;
      setMessages(result.data.messages);
      setWindowOpen(result.data.windowOpen);
      setWindowExpiresAt(result.data.windowExpiresAt);
      setStatus(result.data.status);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    const result = await sendApi.post("/api/messages/send", { conversationId, text });
    if (result.status !== ApiRequestStatus.DATA) return;
    setMessages((prev) => [...prev, result.data]);
    setText("");
  }

  async function handleClose() {
    const result = await closeApi.post(`/api/conversations/${conversationId}/close`);
    if (result.status === ApiRequestStatus.DATA) setStatus(ConversationStatus.CLOSED);
  }

  const displayName = profileName ?? waId ?? "Contacto";

  const countdown =
    windowOpen && windowExpiresAt ? formatWindowCountdown(windowExpiresAt) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 bg-wa-header px-4 py-2.5 text-white">
        {onBack && (
          <IconButton
            variant={ButtonVariant.ICON_PLAIN}
            icon={<BackArrowIcon className="h-5 w-5" />}
            onClick={onBack}
            ariaLabel="Volver"
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
            <Button variant={ButtonVariant.PILL_ON_DARK} onClick={handleClose} loading={closing} loadingLabel="Cerrando…">
              Cerrar conversación
            </Button>
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
            className={cn(
              "mb-2 flex",
              message.direction === MessageDirection.OUTBOUND ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[70%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm",
                message.direction === MessageDirection.OUTBOUND
                  ? "rounded-tr-none bg-wa-bubble-out text-gray-900"
                  : "rounded-tl-none bg-wa-bubble-in text-gray-900",
              )}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content ?? `[${message.type}]`}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-gray-500">
                {formatClockTime(message.timestamp)}
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
        <div className={cn("px-4 pt-1.5 text-xs", countdown.warning ? "text-amber-600" : "text-gray-500")}>
          {countdown.label}
        </div>
      )}

      {status === ConversationStatus.CLOSED && <Banner tone={BannerTone.NOTICE}>Esta conversación está cerrada.</Banner>}

      {status === ConversationStatus.OPEN && !windowOpen && (
        <Banner tone={BannerTone.NOTICE}>
          La ventana de 24 horas está cerrada — envía un mensaje de plantilla aprobado en lugar de
          texto libre.
        </Banner>
      )}

      {sendError && <Banner tone={BannerTone.ERROR}>{sendError}</Banner>}

      {closeError && <Banner tone={BannerTone.ERROR}>{closeError}</Banner>}

      <div className="flex items-center gap-2 bg-wa-footer px-3 py-2">
        <EmojiIcon className="h-6 w-6 flex-shrink-0 text-gray-500" />
        <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <TextInput
            variant={TextInputVariant.INLINE}
            value={text}
            onValueChange={setText}
            onEnter={handleSend}
            disabled={status === ConversationStatus.CLOSED || !windowOpen || sending}
            placeholder={
              status === ConversationStatus.CLOSED
                ? "Conversación cerrada"
                : windowOpen
                  ? "Escribe un mensaje"
                  : "Ventana de 24h cerrada"
            }
          />
          <PaperclipIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
          <CameraIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
        </div>
        <IconButton
          variant={ButtonVariant.ICON_SOLID_WHATSAPP}
          size={ButtonSize.ICON_LG}
          icon={<SendIcon className="h-5 w-5" />}
          onClick={handleSend}
          disabled={status === ConversationStatus.CLOSED || !windowOpen || sending || !text.trim()}
          ariaLabel="Enviar mensaje"
        />
      </div>
    </div>
  );
}

