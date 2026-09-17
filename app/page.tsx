"use client";

import { useState } from "react";
import ConversationList from "./components/ConversationList";
import ConversationView from "./components/ConversationView";
import Sandbox from "./components/Sandbox";

type Tab = "real" | "sandbox";

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("real");

  return (
    <div className="grid h-screen grid-rows-[auto_1fr]">
      <div className="flex border-b border-gray-200 bg-white">
        <TabButton active={tab === "real"} onClick={() => setTab("real")}>
          Chat real
        </TabButton>
        <TabButton active={tab === "sandbox"} onClick={() => setTab("sandbox")}>
          Sandbox
        </TabButton>
      </div>

      <div className="overflow-hidden">
        {tab === "real" ? (
          <div className="grid h-full grid-cols-[320px_1fr]">
            <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
            <div className="flex h-full flex-col">
              {selectedId ? (
                <ConversationView key={selectedId} conversationId={selectedId} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Select a conversation to view messages.
                </div>
              )}
            </div>
          </div>
        ) : (
          <Sandbox />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium ${
        active
          ? "border-b-2 border-blue-600 text-blue-600"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
