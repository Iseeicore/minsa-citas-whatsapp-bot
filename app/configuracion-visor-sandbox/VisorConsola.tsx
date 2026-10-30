"use client";

import { useState } from "react";
import ConversationList from "@/app/components/ConversationList";
import ConversationView from "@/app/components/ConversationView";
import Sandbox from "@/app/components/Sandbox";
import type { Conversation } from "@/app/components/types";
import { ChatPlaceholderIcon, SandboxGlyph, WhatsAppGlyph } from "@/app/components/icons";
import { Avatar } from "@/app/components/ui/Avatar";
import { Button } from "@/app/components/ui/Button";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { cn } from "@/lib/utils/cn";
import { type SandboxMode as Mode, initialModeFromQuery } from "@/lib/utils/sandbox-mode";

const SANDBOX_AVATAR_TEXT = "MD";
const SANDBOX_ROW_TITLE_TEXT = "Asistente MINSA Responde";
const SANDBOX_ROW_HINT_TEXT = "Toca para iniciar una conversación de prueba";

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
          {mode === "real" ? <ConversationPane conversation={selectedConversation} /> : <Sandbox />}
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
              <ConversationPane conversation={selectedConversation} onBack={() => setMobileShowingDetail(false)} />
            ) : (
              <Sandbox onBack={() => setMobileShowingDetail(false)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPane({ conversation, onBack }: { conversation: Conversation | null; onBack?: () => void }) {
  if (!conversation) {
    return <EmptyState icon={<ChatPlaceholderIcon />}>Selecciona una conversación para ver los mensajes.</EmptyState>;
  }

  return (
    <ConversationView
      key={conversation.id}
      conversationId={conversation.id}
      profileName={conversation.profileName}
      waId={conversation.waId}
      onBack={onBack}
    />
  );
}

function SandboxListRow({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ul>
        <li>
          <Button variant={ButtonVariant.ROW} width={ButtonWidth.FULL} onClick={onSelect}>
            <Avatar className="bg-gradient-to-r from-sb-header-from to-sb-header-to font-bold">{SANDBOX_AVATAR_TEXT}</Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{SANDBOX_ROW_TITLE_TEXT}</span>
              <span className="block truncate text-xs text-gray-500">{SANDBOX_ROW_HINT_TEXT}</span>
            </span>
          </Button>
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
      <Button
        variant={ButtonVariant.SWITCH_TRACK}
        width={ButtonWidth.FULL}
        role="switch"
        aria-checked={isSandbox}
        onClick={() => onChange(isSandbox ? "real" : "sandbox")}
      >
        <span
          className={cn(
            "absolute top-1 h-8 w-[calc(50%-4px)] rounded-full bg-white shadow transition-transform duration-200",
            isSandbox ? "translate-x-[calc(100%+4px)]" : "translate-x-0",
          )}
        />
        <span
          className={cn(
            "relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-medium",
            isSandbox ? "text-gray-500" : "text-wa-header",
          )}
        >
          <WhatsAppGlyph className="h-3.5 w-3.5" />
          Chat real
        </span>
        <span
          className={cn(
            "relative z-10 flex w-1/2 items-center justify-center gap-1.5 text-xs font-medium",
            isSandbox ? "text-sb-accent" : "text-gray-500",
          )}
        >
          <SandboxGlyph className="h-3.5 w-3.5" />
          Sandbox
        </span>
      </Button>
    </div>
  );
}

