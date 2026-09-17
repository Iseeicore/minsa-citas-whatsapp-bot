"use client";

import { useState } from "react";
import ConversationList from "./components/ConversationList";
import ConversationView from "./components/ConversationView";
import Sandbox from "./components/Sandbox";
import type { Conversation } from "./components/types";

type Mode = "real" | "sandbox";

export default function Home() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [mode, setMode] = useState<Mode>("real");

  return (
    <div className="grid h-screen grid-cols-[320px_1fr] bg-gray-100">
      <aside className="flex h-full flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <ConversationList
          selectedId={selectedConversation?.id ?? null}
          onSelect={setSelectedConversation}
        />
      </aside>

      <main className="h-full overflow-hidden">
        {mode === "real" ? (
          selectedConversation ? (
            <ConversationView
              key={selectedConversation.id}
              conversationId={selectedConversation.id}
              profileName={selectedConversation.profileName}
              waId={selectedConversation.waId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--wa-panel-bg)] text-sm text-gray-500">
              <ChatPlaceholderIcon />
              <p>Selecciona una conversación para ver los mensajes.</p>
            </div>
          )
        ) : (
          <Sandbox />
        )}
      </main>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const isSandbox = mode === "sandbox";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Panel</span>
      <button
        type="button"
        role="switch"
        aria-checked={isSandbox}
        onClick={() => onChange(isSandbox ? "real" : "sandbox")}
        className="relative flex h-10 w-full items-center rounded-full bg-gray-200 p-1 transition-colors"
      >
        <span
          className={`absolute top-1 h-8 w-[calc(50%-4px)] rounded-full bg-white shadow transition-transform duration-200 ${
            isSandbox ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
          }`}
        />
        <span
          className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-medium ${
            !isSandbox ? "text-[var(--wa-header)]" : "text-gray-500"
          }`}
        >
          <WhatsAppGlyph className="h-3.5 w-3.5" />
          Chat real
        </span>
        <span
          className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-medium ${
            isSandbox ? "text-[var(--sb-accent)]" : "text-gray-500"
          }`}
        >
          <SandboxGlyph className="h-3.5 w-3.5" />
          Sandbox
        </span>
      </button>
    </div>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.06-1.32A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18a7.96 7.96 0 01-4.06-1.11l-.29-.17-3 .78.8-2.92-.19-.3A7.97 7.97 0 1120 12a8 8 0 01-8 8z" />
      <path d="M16.3 13.9c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.53.12-.16.24-.6.77-.74.92-.14.16-.27.18-.5.06-.24-.12-1-.37-1.9-1.18-.7-.62-1.18-1.4-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.28-.73-1.76-.19-.46-.39-.4-.53-.4-.14-.01-.3-.01-.46-.01-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.4-.57 1.6-1.12.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.46-.28z" />
    </svg>
  );
}

function SandboxGlyph({ className }: { className?: string }) {
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
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
      <path d="M9.5 12.5l1.8 1.8L15 10.5" />
    </svg>
  );
}

function ChatPlaceholderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-12 w-12 text-gray-400"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}
