"use client";

import { useEffect, useRef, useState } from "react";
import type { InboundEventType, SendEffect } from "@/lib/fsm/core/types";
import type { ChatEntry, SessionSnapshot } from "@/app/components/sandbox-chat/types";
import {
  ENTRIES_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  getOrCreateFrom,
  readStoredEntries,
  readStoredSession,
} from "@/app/components/sandbox-chat/storage";
import { SessionState } from "@/lib/enums/session-state";
import { randomId, readFileAsDataUri, sleep } from "@/app/components/sandbox-chat/browser";
import { SandboxHeader, type WindowControls } from "@/app/components/sandbox-chat/SandboxHeader";
import { Composer } from "@/app/components/sandbox-chat/Composer";
import { ChatBubble } from "@/app/components/sandbox-chat/ChatBubble";
import { TypingIndicator } from "@/app/components/sandbox-chat/TypingIndicator";
import { DniCard } from "@/app/components/sandbox-chat/DniCard";
import { DebugPanel } from "@/app/components/sandbox-chat/DebugPanel";
import { ErrorBanner } from "@/app/components/ui/ErrorBanner";

const DNI_AWAITING_STATE = SessionState.CITA_AWAITING_DNI;

const WELCOME_TRIGGER_TEXT = "Hola";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TOO_LARGE_MESSAGE =
  "La imagen es muy pesada para subirla en el entorno de Vercel. Por el momento estamos trabajando en la mejora.";

export default function Sandbox({
  onBack,
  windowControls,
  showDebugPanel = true,
  active = true,
}: {
  onBack?: () => void;
  windowControls?: WindowControls;
  showDebugPanel?: boolean;
  active?: boolean;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [entries, setEntriesState] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSessionState] = useState<SessionSnapshot | null>(null);
  const [dniValue, setDniValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeRequestedRef = useRef(false);

  function setEntries(updater: ChatEntry[] | ((prev: ChatEntry[]) => ChatEntry[])) {
    setEntriesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }

  function setSession(next: SessionSnapshot | null) {
    setSessionState(next);
    try {
      if (next) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(getOrCreateFrom());
    setEntriesState(readStoredEntries());
    setSessionState(readStoredSession());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, typing]);

  useEffect(() => {
    if (!active || !from || entries.length > 0 || welcomeRequestedRef.current) return;
    welcomeRequestedRef.current = true;
    sendTurn({ type: "text", text: WELCOME_TRIGGER_TEXT, reset: true });
  });

  async function sendTurn(
    payload: {
      type: InboundEventType;
      text?: string;
      listId?: string;
      mediaDataUri?: string;
      reset?: boolean;
      resetAll?: boolean;
    },
    userDisplayText?: string,
  ) {
    if (!from) return;

    if (userDisplayText) {
      setEntries((prev) => [...prev, { id: randomId(), from: "user", text: userDisplayText }]);
    }

    setLoading(true);
    setError(null);
    setTyping(true);

    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "El sandbox no está disponible.");
        return;
      }

      const data = (await res.json()) as { sent: SendEffect[]; session: SessionSnapshot };

      // El mensaje de bienvenida (primer turno, sin sesión) sale de inmediato; los demás simulan el "escribiendo…".
      const esBienvenida = session === null;
      for (const effect of data.sent) {
        if (!esBienvenida) {
          setTyping(true);
          await sleep(500);
          setTyping(false);
        }
        setEntries((prev) => [...prev, { id: randomId(), from: "bot" as const, effect }]);
      }

      setSession(data.session);
    } catch {
      setError("No se pudo conectar con el sandbox.");
    } finally {
      setTyping(false);
      setLoading(false);
    }
  }

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    sendTurn({ type: "text", text }, text);
  }

  function handleOptionClick(kind: "list" | "buttons", id: string, title: string) {
    sendTurn({ type: kind === "list" ? "list" : "button", listId: id }, title);
  }

  function handleReset() {
    if (!window.confirm("Esto reiniciará TODAS las conversaciones de prueba (sandbox), en cualquier dispositivo. ¿Continuar?")) {
      return;
    }
    setEntries([]);
    setSession(null);
    setDniValue("");
    sendTurn({ type: "text", resetAll: true });
  }

  async function handleImageSelect(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      setError(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }

    setError(null);
    const dataUri = await readFileAsDataUri(file);
    sendTurn({ type: "image", mediaDataUri: dataUri }, `Imagen: ${file.name}`);
  }

  function handleDniSubmit() {
    const value = dniValue.trim();
    if (!value) return;
    setDniValue("");
    sendTurn({ type: "text", text: value }, value);
  }

  const showDniCard = session?.state === DNI_AWAITING_STATE;

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
              <button
                onClick={handleReset}
                className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Reiniciar todas las pruebas
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {entries.map((entry) => (
              <ChatBubble key={entry.id} entry={entry} onOptionClick={handleOptionClick} />
            ))}

            {typing && <TypingIndicator />}

            {showDniCard && (
              <DniCard value={dniValue} onChange={setDniValue} onSubmit={handleDniSubmit} />
            )}

            <div ref={bottomRef} />
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <Composer
            from={from}
            loading={loading}
            inputText={inputText}
            setInputText={setInputText}
            handleSend={handleSend}
            handleImageSelect={handleImageSelect}
          />
        </div>

        {showDebugPanel && <DebugPanel from={from} session={session} />}
      </div>
    </div>
  );
}
