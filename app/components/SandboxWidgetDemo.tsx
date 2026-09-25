"use client";

import { useState } from "react";
import MinsaDigitalBackdrop from "@/app/components/MinsaDigitalBackdrop";
import Sandbox from "@/app/components/Sandbox";

export default function SandboxWidgetDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative w-full bg-gray-100 sm:overflow-auto ${
        open ? "max-sm:overflow-hidden" : "overflow-auto"
      }`}
    >
      <MinsaDigitalBackdrop />

      {
}
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
          {
}
          <span className="absolute inset-0 animate-ping rounded-full bg-white/50" />
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- avatar pequeño de tamaño fijo */}
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
