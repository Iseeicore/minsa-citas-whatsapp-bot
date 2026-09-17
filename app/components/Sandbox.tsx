"use client";

import { useEffect, useRef, useState } from "react";
import type { SendEffect } from "@/lib/fsm/types";

type SessionSnapshot = {
  state: string;
  slots: Record<string, unknown>;
  counters: Record<string, number>;
};

type ChatEntry =
  | { id: string; from: "user"; text: string }
  | { id: string; from: "bot"; effect: SendEffect };

const FROM_STORAGE_KEY = "sandbox-from";

// Vercel Functions hard-cap the request body at 4.5MB regardless of what the
// destination API supports (the real quejas backend allows up to 50MB — that
// capacity is untouched, this limit is specific to the browser->our-function
// hop). Staying well under that after base64's ~33% size inflation.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TOO_LARGE_MESSAGE =
  "La imagen es muy pesada para subirla en el entorno de Vercel. Por el momento estamos trabajando en la mejora.";

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function getOrCreateFrom(): string | null {
  // Reading localStorage during SSR would throw — this component only ever
  // needs the real id once mounted in the browser, so a null placeholder is
  // used for the (never-rendered-meaningfully) server pass.
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(FROM_STORAGE_KEY);
    if (stored) return stored;

    const created = `sandbox-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(FROM_STORAGE_KEY, created);
    return created;
  } catch {
    // Private browsing / blocked storage — fall back to a per-mount id.
    return `sandbox-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function Sandbox() {
  const [from] = useState<string | null>(() => getOrCreateFrom());
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  async function sendTurn(
    payload: {
      type: "text" | "button" | "list" | "image";
      text?: string;
      listId?: string;
      mediaDataUri?: string;
      reset?: boolean;
    },
    userDisplayText?: string,
  ) {
    if (!from) return;

    if (userDisplayText) {
      setEntries((prev) => [...prev, { id: randomId(), from: "user", text: userDisplayText }]);
    }

    setLoading(true);
    setError(null);

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
      setEntries((prev) => [
        ...prev,
        ...data.sent.map((effect) => ({ id: randomId(), from: "bot" as const, effect })),
      ]);
      setSession(data.session);
    } catch {
      setError("No se pudo conectar con el sandbox.");
    } finally {
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
    setEntries([]);
    setSession(null);
    sendTurn({ type: "text", reset: true });
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
    sendTurn({ type: "image", mediaDataUri: dataUri }, `📷 ${file.name}`);
  }

  return (
    <div className="grid h-full grid-rows-[1fr_auto]">
      <div className="grid grid-cols-[1fr_260px] overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">Sandbox — Cita / Reclamo</h2>
            <button
              onClick={handleReset}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Reiniciar conversación
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {entries.map((entry) => (
              <ChatBubble key={entry.id} entry={entry} onOptionClick={handleOptionClick} />
            ))}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-gray-200 p-3">
            <label
              className={`rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${
                !from || loading ? "pointer-events-none opacity-50" : "cursor-pointer"
              }`}
            >
              📷
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!from || loading}
                onChange={(e) => {
                  handleImageSelect(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              disabled={!from || loading}
              placeholder="Escribe un mensaje…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            />
            <button
              onClick={handleSend}
              disabled={!from || loading || !inputText.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
            >
              Enviar
            </button>
          </div>
        </div>

        <DebugPanel from={from} session={session} />
      </div>
    </div>
  );
}

function ChatBubble({
  entry,
  onOptionClick,
}: {
  entry: ChatEntry;
  onOptionClick: (kind: "list" | "buttons", id: string, title: string) => void;
}) {
  if (entry.from === "user") {
    return (
      <div className="mb-2 flex justify-end">
        <div className="max-w-[70%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }

  const { effect } = entry;

  return (
    <div className="mb-2 flex justify-start">
      <div className="max-w-[80%] rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-900">
        <div className="whitespace-pre-wrap">{effect.text}</div>

        {effect.kind === "send_interactive_list" && (
          <div className="mt-2 flex flex-col gap-1">
            {effect.rows.map((row) => (
              <button
                key={row.id}
                onClick={() => onOptionClick("list", row.id, row.title)}
                className="rounded-md border border-gray-400 bg-white px-2 py-1 text-left text-xs hover:bg-gray-50"
              >
                <div className="font-medium">{row.title}</div>
                {row.description && <div className="text-gray-500">{row.description}</div>}
              </button>
            ))}
          </div>
        )}

        {effect.kind === "send_buttons" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {effect.buttons.map((button) => (
              <button
                key={button.id}
                onClick={() => onOptionClick("buttons", button.id, button.title)}
                className="rounded-full border border-gray-400 bg-white px-3 py-1 text-xs hover:bg-gray-50"
              >
                {button.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DebugPanel({ from, session }: { from: string | null; session: SessionSnapshot | null }) {
  return (
    <div className="overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 text-xs">
      <h3 className="mb-2 font-semibold text-gray-700">Debug</h3>
      <div className="mb-2">
        <span className="font-medium">from:</span> {from ?? "…"}
      </div>
      <div className="mb-2">
        <span className="font-medium">state:</span> {session?.state ?? "—"}
      </div>
      <div className="mb-2">
        <div className="font-medium">slots</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px]">
          {JSON.stringify(session?.slots ?? {}, null, 2)}
        </pre>
      </div>
      <div>
        <div className="font-medium">counters</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px]">
          {JSON.stringify(session?.counters ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
