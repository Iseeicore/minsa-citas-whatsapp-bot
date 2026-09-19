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
    // On a small screen the chat panel becomes a full-screen overlay (see
    // the `open` classes below) — the backdrop stays scrollable underneath
    // it otherwise, which feels broken even though the panel visually
    // covers everything, so scrolling locks there while open. From `sm` up
    // the panel is just a small floating card, so the backdrop keeps
    // scrolling normally regardless of `open`.
    <div
      className={`relative min-h-dvh w-full bg-gray-100 sm:overflow-auto ${
        open ? "max-sm:overflow-hidden" : "overflow-auto"
      }`}
    >
      {/* The screenshot is a wide desktop capture — shrinking it to a
          narrow phone's width (object-cover or plain w-full) either crops
          out the MINSA branding or scales the whole page down to an
          illegible sliver. Keeping a legible minimum width instead and
          letting the page scroll/pan (both axes) shows it at a readable
          size, same as browsing the real desktop site on a phone. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, not a content image */}
      <img
        src="/minsa-digital-bg.png"
        alt=""
        aria-hidden="true"
        className="block h-auto min-w-[900px] w-full"
      />

      {/* Mobile-first: a small screen gets the chat full-bleed (it's the
          main event there, not a corner widget) so it's fully usable
          instead of a cramped card fighting the background for space.
          From `sm` up it becomes the floating card over the backdrop. */}
      <div
        className={`fixed inset-0 z-20 flex flex-col overflow-hidden transition-all duration-200 sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(640px,calc(100dvh-112px))] sm:w-[380px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:shadow-2xl ${
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
        style={{ paddingBottom: open ? "env(safe-area-inset-bottom)" : undefined }}
      >
        <Sandbox showDebugPanel={false} onBack={() => setOpen(false)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pregúntale a MINSA"
        className={`fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-[#9c1c3f] py-2 pl-2 pr-3 text-white shadow-xl transition-opacity duration-200 hover:bg-[#82182f] sm:pr-4 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center">
          {/* Attention ring — the backdrop is a busy screenshot, this keeps
              the launcher from getting lost in it. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-white/50" />
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size avatar */}
            <img
              src="/minsa-logo.png"
              alt=""
              className="h-full w-full object-cover object-top"
            />
          </span>
        </span>
        <span className="text-sm">
          Pregúntale a <span className="font-bold">MINSA</span>
        </span>
        <ChevronDownIcon className="hidden h-4 w-4 flex-shrink-0 sm:block" />
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
