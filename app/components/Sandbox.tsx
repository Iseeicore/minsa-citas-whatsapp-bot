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
const DNI_AWAITING_STATE = "cita_awaiting_dni";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export default function Sandbox({ onBack }: { onBack?: () => void }) {
  const [from] = useState<string | null>(() => getOrCreateFrom());
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [dniValue, setDniValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, typing]);

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

      // Reveal each bot message one at a time (with a "escribiendo…"
      // pause before each) instead of dumping the whole turn at once —
      // a turn can produce several messages (e.g. "Buscando tu
      // distrito…" followed by the result), and this reads much more
      // like a real conversation. `loading` (and the disabled input)
      // stays on for this whole sequence, same as it did for the fetch.
      for (const effect of data.sent) {
        setTyping(true);
        await sleep(500);
        setTyping(false);
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
    setEntries([]);
    setSession(null);
    setDniValue("");
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
    sendTurn({ type: "image", mediaDataUri: dataUri }, `📎 ${file.name}`);
  }

  function handleDniSubmit() {
    const value = dniValue.trim();
    if (!value) return;
    setDniValue("");
    sendTurn({ type: "text", text: value }, value);
  }

  const showDniCard = session?.state === DNI_AWAITING_STATE;

  return (
    <div className="grid h-full grid-rows-[1fr_auto] bg-[var(--sb-panel-bg)]">
      <div className="grid grid-cols-1 overflow-hidden lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col overflow-hidden">
          <header className="rounded-t-xl bg-gradient-to-r from-[var(--sb-header-from)] to-[var(--sb-header-to)] px-4 pb-3 pt-2 text-white">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40" />
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  type="button"
                  aria-label="Volver"
                  onClick={onBack}
                  className="flex-shrink-0 text-white/80 hover:text-white"
                >
                  <BackArrowIcon className="h-5 w-5" />
                </button>
              )}
              <div className="relative flex-shrink-0">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  MD
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--sb-header-to)] bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">Asistente MINSA Digital</span>
                  <span className="flex-shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-medium">
                    Oficial
                  </span>
                </div>
                <div className="truncate text-xs text-white/80">En línea · Citas en línea</div>
              </div>
              <button
                type="button"
                aria-label="Colapsar panel"
                className="flex-shrink-0 text-white/80 hover:text-white"
              >
                <ChevronDownIcon className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] text-gray-400">Hoy</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="flex items-center justify-end px-4 pt-2">
            <button
              onClick={handleReset}
              className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Reiniciar conversación
            </button>
          </div>

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

          {error && (
            <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
            <label
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--sb-accent)] hover:bg-blue-50 ${
                !from || loading ? "pointer-events-none opacity-50" : "cursor-pointer"
              }`}
            >
              <PaperclipIcon className="h-5 w-5" />
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
            <div className="flex flex-1 items-center rounded-full bg-gray-100 px-4 py-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                disabled={!from || loading}
                placeholder="Escribe un mensaje o consulta..."
                className="flex-1 border-none bg-transparent text-sm outline-none disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!from || loading || !inputText.trim()}
              aria-label="Enviar mensaje"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sb-accent)] text-white transition-opacity disabled:opacity-40"
            >
              <SendIcon className="h-4 w-4" />
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
      <div className="mb-3 flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-none bg-[var(--sb-accent)] px-3 py-2 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }

  const { effect } = entry;

  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
        MD
      </span>
      <div className="max-w-[75%] rounded-2xl rounded-tl-none border border-gray-100 bg-[var(--sb-bubble-bot)] px-3 py-2 text-sm text-gray-800 shadow-sm">
        <div className="whitespace-pre-wrap">{effect.text}</div>

        {effect.kind === "send_interactive_list" && (
          <div className="mt-2 flex flex-col gap-1">
            {effect.rows.map((row) => (
              <button
                key={row.id}
                onClick={() => onOptionClick("list", row.id, row.title)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-left text-xs text-blue-700 hover:bg-blue-100"
              >
                <div className="font-medium">{row.title}</div>
                {row.description && <div className="text-blue-500">{row.description}</div>}
              </button>
            ))}
          </div>
        )}

        {effect.kind === "send_cta_url" && (
          <a
            href={effect.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block rounded-full border border-green-500 bg-white px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
          >
            {effect.buttonText}
          </a>
        )}

        {effect.kind === "send_buttons" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {effect.buttons.map((button) => (
              <button
                key={button.id}
                onClick={() => onOptionClick("buttons", button.id, button.title)}
                className="rounded-full border border-blue-500 bg-white px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
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

function TypingIndicator() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
        MD
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-gray-100 bg-[var(--sb-bubble-bot)] px-3 py-2.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function DniCard({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="ml-9 mb-3 max-w-[75%] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--sb-accent)]">
        <LockIcon className="h-4 w-4" />
        Acceso rápido con Documento
      </div>
      <input
        type="text"
        inputMode="numeric"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="Ingresa los 8 dígitos de tu DNI"
        className="mb-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[var(--sb-accent)]"
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="w-full rounded-lg bg-[var(--sb-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
      >
        Validar y Continuar Cita
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-400">
        ¿No estás registrado?{" "}
        <a href="#" className="text-[var(--sb-accent)] hover:underline">
          Regístrate aquí
        </a>
      </p>
    </div>
  );
}

function DebugPanel({ from, session }: { from: string | null; session: SessionSnapshot | null }) {
  return (
    <div className="hidden overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 text-xs lg:block">
      <h3 className="mb-2 font-semibold text-gray-700">Debug</h3>
      <div className="mb-2">
        <span className="font-medium text-gray-800">from:</span>{" "}
        <span className="text-gray-600">{from ?? "…"}</span>
      </div>
      <div className="mb-2">
        <span className="font-medium text-gray-800">state:</span>{" "}
        <span className="text-gray-600">{session?.state ?? "—"}</span>
      </div>
      <div className="mb-2">
        <div className="font-medium text-gray-800">slots</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px] text-gray-600">
          {JSON.stringify(session?.slots ?? {}, null, 2)}
        </pre>
      </div>
      <div>
        <div className="font-medium text-gray-800">counters</div>
        <pre className="whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px] text-gray-600">
          {JSON.stringify(session?.counters ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
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

function ChevronDownIcon({ className }: { className?: string }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Adjuntar imagen"
    >
      <path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 01-7.78-7.78l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a1.5 1.5 0 01-2.12-2.12l8.49-8.48" />
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

function LockIcon({ className }: { className?: string }) {
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
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}
