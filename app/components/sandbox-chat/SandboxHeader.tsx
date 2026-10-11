import { ChevronUpIcon, CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "@/app/components/icons";
import { IconButton } from "@/app/components/ui/IconButton";
import { Badge } from "@/app/components/ui/Badge";
import { AssistantCard } from "@/app/components/ui/AssistantCard";
import { WidgetMode } from "@/lib/enums/widget-mode";

export type WindowControls = {
  mode: WidgetMode;
  onToggleExpand: () => void;
  onToggleMinimize: () => void;
  onClose: () => void;
};

const CONTROL_CLASS_NAME = "rounded p-1.5 hover:bg-white/10";

function WindowControlButtons({ controls }: { controls: WindowControls }) {
  const minimized = controls.mode === WidgetMode.MINIMIZED;
  const expanded = controls.mode === WidgetMode.EXPANDED;

  return (
    <div className="flex items-center gap-0.5">
      {!minimized && (
        <IconButton
          icon={expanded ? <RestoreIcon className="h-4 w-4" /> : <MaximizeIcon className="h-4 w-4" />}
          onClick={controls.onToggleExpand}
          ariaLabel={expanded ? "Reducir" : "Agrandar"}
          hitAreaClassName={CONTROL_CLASS_NAME}
        />
      )}
      <IconButton
        icon={minimized ? <ChevronUpIcon className="h-4 w-4" /> : <MinimizeIcon className="h-4 w-4" />}
        onClick={controls.onToggleMinimize}
        ariaLabel={minimized ? "Restaurar" : "Minimizar"}
        hitAreaClassName={CONTROL_CLASS_NAME}
      />
      <IconButton
        icon={<CloseIcon className="h-4 w-4" />}
        onClick={controls.onClose}
        ariaLabel="Cerrar"
        hitAreaClassName={CONTROL_CLASS_NAME}
      />
    </div>
  );
}

export function SandboxHeader({
  onBack,
  windowControls,
}: {
  onBack?: () => void;
  windowControls?: WindowControls;
}) {
  return (
    <header className="shrink-0">
      <div className="flex h-10 items-center justify-between bg-sb-navy px-4 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black uppercase tracking-widest">Minsa</span>
          <span className="text-xs text-white/70">| Perú</span>
          <Badge className="bg-white/15 text-white">Digital</Badge>
        </div>
        {windowControls ? (
          <WindowControlButtons controls={windowControls} />
        ) : (
          onBack && (
            <IconButton
              icon={<CloseIcon className="h-4 w-4" />}
              onClick={onBack}
              ariaLabel="Cerrar"
              hitAreaClassName={CONTROL_CLASS_NAME}
            />
          )
        )}
      </div>

      <AssistantCard fluid className="border-b border-sb-bubble-border bg-white pl-0 pr-3 pt-3" />
    </header>
  );
}
