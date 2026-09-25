import { BackArrowIcon, ChevronDownIcon } from "@/app/components/sandbox-chat/icons";

export function SandboxHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="rounded-t-xl bg-gradient-to-r from-[var(--sb-header-from)] to-[var(--sb-header-to)] px-4 pb-3 pt-2 text-white">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40" />
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            aria-label="Volver"
            onClick={onBack}
            className="-m-3 flex-shrink-0 p-3 text-white/80 hover:text-white"
          >
            <BackArrowIcon className="h-5 w-5" />
          </button>
        )}
        <div className="relative flex-shrink-0">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- avatar pequeño de tamaño fijo */}
            <img
              src="/minsa-logo.png"
              alt="MINSA"
              className="h-full w-full object-cover object-top"
            />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--sb-header-to)] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">Asistente MINSA Digital</span>
            <span className="flex-shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-medium">
              Oficial
            </span>
          </div>
          <div className="truncate text-xs text-white/80">En línea · Citas en línea</div>
        </div>
        <button
          type="button"
          aria-label="Colapsar panel"
          className="flex-shrink-0 text-white/80 hover:text-white"
        >
          <ChevronDownIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
