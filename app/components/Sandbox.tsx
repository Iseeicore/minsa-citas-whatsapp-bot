"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import type { SandboxReply, SandboxSessionView } from "@/lib/types/sandbox-reply.types";
import { randomUuid } from "@/lib/utils/random-uuid";
import { getOrCreateFrom, takePreviousFrom } from "@/app/components/sandbox-chat/storage";
import { SessionState } from "@/lib/enums/session-state";
import { closePreviousConversation, readFileAsDataUri, sleep } from "@/app/components/sandbox-chat/browser";
import { SandboxHeader, type WindowControls } from "@/app/components/sandbox-chat/SandboxHeader";
import { Composer } from "@/app/components/sandbox-chat/Composer";
import { ChatBubble } from "@/app/components/sandbox-chat/ChatBubble";
import { TypingIndicator } from "@/app/components/sandbox-chat/TypingIndicator";
import { DniCard } from "@/app/components/sandbox-chat/DniCard";
import { DebugPanel } from "@/app/components/sandbox-chat/DebugPanel";
import { Banner } from "@/app/components/ui/Banner";
import { Button } from "@/app/components/ui/Button";
import { BannerTone } from "@/lib/enums/banner-tone";
import { ChatOptionKind } from "@/lib/enums/chat-option-kind";
import { InboundEventType } from "@/lib/enums/inbound-event-type";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { isInteractiveEffect } from "@/lib/utils/interactive-effect";
import { ChatEntryAuthor } from "@/lib/enums/chat-entry-author";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { textoMuyLargoText } from "@/lib/constants/textos/sandbox";
import { postApi } from "@/lib/http/api-client";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import { bytesToMegabytes } from "@/lib/utils/byte-size";

const WELCOME_TRIGGER_TEXT = "Hola";
const SANDBOX_UNREACHABLE_TEXT = "No se pudo conectar con el sandbox.";

const INBOUND_TYPE_BY_OPTION_KIND: Readonly<Record<ChatOptionKind, InboundEventType>> = {
  [ChatOptionKind.LIST]: InboundEventType.LIST,
  [ChatOptionKind.BUTTONS]: InboundEventType.BUTTON,
};

export default function Sandbox({
  imageMaxBytes,
  onBack,
  windowControls,
  showDebugPanel = true,
  active = true,
}: {
  imageMaxBytes: number;
  onBack?: () => void;
  windowControls?: WindowControls;
  showDebugPanel?: boolean;
  active?: boolean;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SandboxSessionView | null>(null);
  const [currentInteractiveId, setCurrentInteractiveId] = useState<string | undefined>(undefined);
  const [dniValue, setDniValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeRequestedRef = useRef(false);

  useEffect(() => {
    const previous = takePreviousFrom();
    if (previous) closePreviousConversation(previous);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(getOrCreateFrom());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, typing]);

  useEffect(() => {
    if (!active || !from || entries.length > 0 || welcomeRequestedRef.current) return;
    welcomeRequestedRef.current = true;
    sendTurn({ type: InboundEventType.TEXT, text: WELCOME_TRIGGER_TEXT, reset: true });
  });

  async function sendTurn(
    payload: {
      type: InboundEventType;
      text?: string;
      listId?: string;
      replyTo?: string;
      mediaDataUri?: string;
      reset?: boolean;
    },
    userDisplayText?: string,
  ) {
    if (!from) return;

    const esBienvenida = payload.reset === true || entries.length === 0;

    if (userDisplayText) {
      setEntries((prev) => [...prev, { id: randomUuid(), from: ChatEntryAuthor.USER, text: userDisplayText }]);
    }

    setLoading(true);
    setError(null);
    setTyping(true);

    try {
      const result = await postApi<SandboxReply>(
        "/api/sandbox",
        { from, ...payload },
        { failed: "El sandbox no está disponible.", unreachable: SANDBOX_UNREACHABLE_TEXT },
      );

      if (result.status === ApiRequestStatus.ERROR) {
        setError(result.message);
        return;
      }

      const { data } = result;
      const lastInteractive = data.sent.map(isInteractiveEffect).lastIndexOf(true);
      setCurrentInteractiveId(data.interactiveId);

      for (const [index, effect] of data.sent.entries()) {
        if (!esBienvenida) {
          setTyping(true);
          await sleep(500);
          setTyping(false);
        }
        const interactiveId = index === lastInteractive ? data.interactiveId : undefined;
        setEntries((prev) => [...prev, { id: randomUuid(), from: ChatEntryAuthor.BOT, effect, interactiveId }]);
      }

      setSession(data.session);
    } catch {
      setError(SANDBOX_UNREACHABLE_TEXT);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  }

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    sendTurn({ type: InboundEventType.TEXT, text }, text);
  }

  function handleOptionClick(kind: ChatOptionKind, id: string, title: string, replyTo: string | undefined) {
    sendTurn({ type: INBOUND_TYPE_BY_OPTION_KIND[kind], listId: id, replyTo }, title);
  }

  function handleReset() {
    if (!window.confirm("Esto reiniciará esta conversación de prueba. ¿Continuar?")) {
      return;
    }
    setEntries([]);
    setSession(null);
    setCurrentInteractiveId(undefined);
    setDniValue("");
    sendTurn({ type: InboundEventType.TEXT, reset: true });
  }

  async function handleImageSelect(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (file.size > imageMaxBytes) {
      setError(`La imagen supera el tamaño máximo permitido (${bytesToMegabytes(imageMaxBytes)} MB). Envía una imagen más liviana.`);
      return;
    }

    setError(null);
    const dataUri = await readFileAsDataUri(file);
    sendTurn({ type: InboundEventType.IMAGE, mediaDataUri: dataUri }, `Imagen: ${file.name}`);
  }

  function handleDniSubmit() {
    const value = dniValue.trim();
    if (!value) return;
    setDniValue("");
    sendTurn({ type: InboundEventType.TEXT, text: value }, value);
  }

  const showDniCard = session?.state === SessionState.CITA_AWAITING_DNI;

  return (
    <div className="grid h-full grid-rows-[1fr_auto] bg-sb-panel">
      <div
        className={
          showDebugPanel
            ? "grid grid-cols-1 overflow-hidden lg:grid-cols-[1fr_260px]"
            : "grid grid-cols-1 overflow-hidden"
        }
      >
        <div className="flex flex-col overflow-hidden">
          <SandboxHeader onBack={onBack} windowControls={windowControls} />

          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">Hoy</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {showDebugPanel && (
            <div className="flex items-center justify-end px-4 pt-2">
              <Button variant={ButtonVariant.PILL_NEUTRAL} onClick={handleReset}>
                Reiniciar esta prueba
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {entries.map((entry) => (
              <ChatBubble
                key={entry.id}
                entry={entry}
                disabled={entry.from === ChatEntryAuthor.BOT && entry.interactiveId !== currentInteractiveId}
                onOptionClick={(kind, id, title) => handleOptionClick(kind, id, title, entry.from === ChatEntryAuthor.BOT ? entry.interactiveId : undefined)}
              />
            ))}

            {typing && <TypingIndicator />}

            {showDniCard && (
              <DniCard value={dniValue} onChange={setDniValue} onSubmit={handleDniSubmit} />
            )}

            <div ref={bottomRef} />
          </div>

          {error && <Banner tone={BannerTone.ERROR}>{error}</Banner>}

          <Composer
            from={from}
            loading={loading}
            inputText={inputText}
            setInputText={setInputText}
            handleSend={handleSend}
            handleImageSelect={handleImageSelect}
            onTooLong={() => setError(textoMuyLargoText(SANDBOX_TEXT_MAX_LENGTH))}
          />
        </div>

        {showDebugPanel && <DebugPanel from={from} session={session} />}
      </div>
    </div>
  );
}
