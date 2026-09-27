"use client";

import { useState } from "react";
import ConversationList from "@/app/components/ConversationList";
import ConversationView from "@/app/components/ConversationView";
import Sandbox from "@/app/components/Sandbox";
import type { Conversation } from "@/app/components/types";
import { ChatPlaceholderIcon, SandboxGlyph, WhatsAppGlyph } from "@/app/components/icons";

type Mode = "real" | "sandbox";

function initialModeFromQuery(): Mode {
  if (typeof window === "undefined") return "real";
  return new URLSearchParams(window.location.search).get("panel") === "sandbox"
    ? "sandbox"
    : "real";
}

export default function Home() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [mode, setMode] = useState<Mode>(initialModeFromQuery);
  const [mobileShowingDetail, setMobileShowingDetail] = useState(false);

  return (
    <div className="h-dvh bg-gray-100">
      <div className="hidden h-full grid-cols-[320px_1fr] lg:grid">
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
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-wa-panel text-sm text-gray-500">
                <ChatPlaceholderIcon />
                <p>Selecciona una conversación para ver los mensajes.</p>
              </div>
            )
          ) : (
            <Sandbox />
          )}
        </main>
      </div>

      <div className="flex h-full flex-col lg:hidden">
        {!mobileShowingDetail ? (
          <>
            <div className="border-b border-gray-200 bg-white px-4 py-4">
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              {mode === "real" ? (
                <ConversationList
                  selectedId={selectedConversation?.id ?? null}
                  onSelect={(conversation) => {
                    setSelectedConversation(conversation);
                    setMobileShowingDetail(true);
                  }}
                />
              ) : (
                <SandboxListRow onSelect={() => setMobileShowingDetail(true)} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            {mode === "real" ? (
              selectedConversation ? (
                <ConversationView
                  key={selectedConversation.id}
                  conversationId={selectedConversation.id}
                  profileName={selectedConversation.profileName}
                  waId={selectedConversation.waId}
                  onBack={() => setMobileShowingDetail(false)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-wa-panel text-sm text-gray-500">
                  <ChatPlaceholderIcon />
                  <p>Selecciona una conversación para ver los mensajes.</p>
                </div>
              )
            ) : (
              <Sandbox onBack={() => setMobileShowingDetail(false)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SandboxListRow({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ul>
        <li>
          <button
            type="button"
            onClick={onSelect}
            className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-sb-header-from to-sb-header-to text-sm font-bold text-white">
              MD
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">
                Asistente MINSA Digital
              </span>
              <span className="block truncate text-xs text-gray-500">
                Toca para iniciar una conversación de prueba
              </span>
            </span>
          </button>
        </li>
      </ul>
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
            !isSandbox ? "text-wa-header" : "text-gray-500"
          }`}
        >
          <WhatsAppGlyph className="h-3.5 w-3.5" />
          Chat real
        </span>
        <span
          className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-medium ${
            isSandbox ? "text-sb-accent" : "text-gray-500"
          }`}
        >
          <SandboxGlyph className="h-3.5 w-3.5" />
          Sandbox
        </span>
      </button>
    </div>
  );
}

