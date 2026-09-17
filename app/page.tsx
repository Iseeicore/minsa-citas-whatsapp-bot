"use client";

import { useState } from "react";
import ConversationList from "./components/ConversationList";
import ConversationView from "./components/ConversationView";

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="grid h-screen grid-cols-[320px_1fr]">
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
  );
}
