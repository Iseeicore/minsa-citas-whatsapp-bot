"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MinsaDigitalBackdrop from "@/app/components/MinsaDigitalBackdrop";
import Sandbox from "@/app/components/Sandbox";
import { clearStoredChat } from "@/app/components/sandbox-chat/storage";
import { AssistantCard } from "@/app/components/ui/AssistantCard";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { WidgetMode } from "@/lib/enums/widget-mode";
import {
  INITIAL_WIDGET_STATE,
  closeWidget,
  openWidget,
  toggleExpand,
  toggleMinimize,
  type WidgetState,
} from "@/lib/utils/widget-state";

type LayoutMode = Exclude<WidgetMode, WidgetMode.LAUNCHER>;

const FRAME_CLASS_NAME: Record<LayoutMode, string> = {
  [WidgetMode.NORMAL]:
    "inset-x-0 bottom-0 top-1/6 md:inset-x-4 md:bottom-24 md:top-4 md:items-end md:justify-end md:pointer-events-none",
  [WidgetMode.EXPANDED]: "inset-0 md:inset-4 md:items-end md:justify-end md:pointer-events-none",
  [WidgetMode.MINIMIZED]: "inset-x-0 bottom-0 md:inset-x-4 md:items-end md:pointer-events-none",
};

const PANEL_CLASS_NAME: Record<LayoutMode, string> = {
  [WidgetMode.NORMAL]: "flex-1 rounded-t-2xl md:h-160 md:max-h-full md:w-96 md:flex-none md:rounded-2xl",
  [WidgetMode.EXPANDED]: "flex-1 md:w-full md:max-w-3xl md:rounded-2xl",
  [WidgetMode.MINIMIZED]: "h-10 rounded-t-xl md:w-80",
};

const HIDDEN_FRAME_CLASS_NAME = "pointer-events-none translate-y-4 opacity-0";

const OPEN_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translateY(1.5rem) scale(0.96)" },
  { opacity: 1, transform: "translateY(0) scale(1)" },
];
const OPEN_TIMING: KeyframeAnimationOptions = { duration: 220, easing: "ease-out" };

const isOpenMode = (mode: WidgetMode) => mode === WidgetMode.NORMAL || mode === WidgetMode.EXPANDED;

export default function SandboxWidgetDemo() {
  const [widget, setWidget] = useState<WidgetState>(INITIAL_WIDGET_STATE);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [needsFreshChat, setNeedsFreshChat] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousMode = useRef(widget.mode);
  const { mode } = widget;

  const showingLauncher = mode === WidgetMode.LAUNCHER;
  const showingChat = isOpenMode(mode);
  const layoutMode: LayoutMode = showingLauncher ? widget.closedFrom : mode;

  useEffect(() => {
    const before = previousMode.current;
    previousMode.current = mode;

    const reopening = isOpenMode(mode) && (before === WidgetMode.LAUNCHER || before === WidgetMode.MINIMIZED);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reopening && !reducedMotion) panelRef.current?.animate(OPEN_KEYFRAMES, OPEN_TIMING);
  }, [mode]);

  const cancelClose = useCallback(() => setConfirmingClose(false), []);

  function confirmClose() {
    clearStoredChat();
    setNeedsFreshChat(true);
    setWidget(closeWidget);
    setConfirmingClose(false);
  }

  function openChat() {
    if (needsFreshChat) {
      setChatKey((key) => key + 1);
      setNeedsFreshChat(false);
    }
    setWidget(openWidget);
  }

  return (
    <div
      className={`relative w-full bg-gray-100 sm:overflow-auto ${
        showingChat ? "max-sm:overflow-hidden" : "overflow-auto"
      }`}
    >
      <MinsaDigitalBackdrop />

      <div
        inert={showingLauncher}
        className={`fixed z-20 flex flex-col transition duration-200 ${FRAME_CLASS_NAME[layoutMode]} ${
          showingLauncher ? HIDDEN_FRAME_CLASS_NAME : ""
        }`}
        style={{ paddingBottom: showingChat ? "env(safe-area-inset-bottom)" : undefined }}
      >
        <div
          ref={panelRef}
          className={`flex min-h-0 w-full origin-bottom-right flex-col overflow-hidden bg-white shadow-2xl md:pointer-events-auto ${PANEL_CLASS_NAME[layoutMode]}`}
        >
          <Sandbox
            key={chatKey}
            showDebugPanel={false}
            active={!showingLauncher}
            windowControls={{
              mode,
              onToggleExpand: () => setWidget(toggleExpand),
              onToggleMinimize: () => setWidget(toggleMinimize),
              onClose: () => setConfirmingClose(true),
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={openChat}
        aria-label="Abrir el asistente virtual MINS IA"
        className={`fixed right-4 z-20 transition duration-200 hover:scale-105 ${
          showingLauncher ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <AssistantCard />
      </button>

      {confirmingClose && (
        <ConfirmDialog
          title="¿Estás seguro de cerrar el chat?"
          message="Se borrará la conversación y se terminará tu sesión. Si quieres seguir después, usa el botón de minimizar."
          confirmLabel="Sí, cerrar"
          cancelLabel="No, volver al chat"
          onConfirm={confirmClose}
          onCancel={cancelClose}
        />
      )}
    </div>
  );
}
