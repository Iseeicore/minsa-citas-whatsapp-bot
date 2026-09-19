"use client";

import { useState } from "react";
import Sandbox from "./Sandbox";

// Demo shell for the public /sandbox route: a static screenshot of the real
// MINSA Digital site as a backdrop, with the bot presented as the floating
// chat-widget launcher a citizen would actually see embedded there — instead
// of the full-page chat view used everywhere else. Sandbox itself is never
// unmounted while the panel is closed (just hidden via CSS), so its in-memory
// chat bubbles survive a close/reopen instead of resetting.
export default function SandboxWidgetDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed decorative backdrop, not a content image */}
      <img
        src="/minsa-digital-bg.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />

      <div
        className={`fixed bottom-24 right-4 z-20 flex h-[min(640px,calc(100dvh-112px))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl shadow-2xl transition-all duration-200 ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <Sandbox showDebugPanel={false} onBack={() => setOpen(false)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pregúntale a MINSA"
        className={`fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-[#9c1c3f] py-2 pl-2 pr-4 text-white shadow-xl transition-opacity duration-200 hover:bg-[#82182f] ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size avatar */}
          <img
            src="/minsa-logo.png"
            alt=""
            className="h-full w-full object-cover object-top"
          />
        </span>
        <span className="text-sm">
          Pregúntale a <span className="font-bold">MINSA</span>
        </span>
        <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
      </button>
    </div>
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
