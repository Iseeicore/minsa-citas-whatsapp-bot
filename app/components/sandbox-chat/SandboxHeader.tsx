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

const CONTROL_ICON_CLASS_NAME = "h-4 w-4";

function WindowControlButtons({ controls }: { controls: WindowControls }) {
  const minimized = controls.mode === WidgetMode.MINIMIZED;
  const expanded = controls.mode === WidgetMode.EXPANDED;
  const ExpandIcon = expanded ? RestoreIcon : MaximizeIcon;
  const MinimizeToggleIcon = minimized ? ChevronUpIcon : MinimizeIcon;

  return (
    <div className="flex items-center gap-0.5">
      {!minimized && (
        <IconButton
          icon={<ExpandIcon className={CONTROL_ICON_CLASS_NAME} />}
          onClick={controls.onToggleExpand}
          ariaLabel={expanded ? "Reducir" : "Agrandar"}
        />
      )}
      <IconButton
        icon={<MinimizeToggleIcon className={CONTROL_ICON_CLASS_NAME} />}
        onClick={controls.onToggleMinimize}
        ariaLabel={minimized ? "Restaurar" : "Minimizar"}
      />
      <IconButton
        icon={<CloseIcon className={CONTROL_ICON_CLASS_NAME} />}
        onClick={controls.onClose}
        ariaLabel="Cerrar"
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
          <span className="text-sm font-black tracking-widest">Minsa</span>
          <span className="text-xs text-white/70">| Perú</span>
          <Badge className="bg-white/15 text-white">Digital</Badge>
        </div>
        {windowControls ? (
          <WindowControlButtons controls={windowControls} />
        ) : (
          onBack && (
            <IconButton icon={<CloseIcon className={CONTROL_ICON_CLASS_NAME} />} onClick={onBack} ariaLabel="Cerrar" />
          )
        )}
      </div>

      <AssistantCard fluid className="border-b border-sb-bubble-border bg-white pl-0 pr-3 pt-3" />
    </header>
  );
}
