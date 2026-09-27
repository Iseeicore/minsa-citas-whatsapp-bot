import Image from "next/image";
import { BackArrowIcon, ChevronDownIcon } from "@/app/components/icons";
import { IconButton } from "@/app/components/ui/IconButton";
import { Badge } from "@/app/components/ui/Badge";

export function SandboxHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="rounded-t-xl bg-gradient-to-r from-sb-header-from to-sb-header-to px-4 pb-3 pt-2 text-white">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40" />
      <div className="flex items-center gap-3">
        {onBack && (
          <IconButton
            icon={<BackArrowIcon className="h-5 w-5" />}
            onClick={onBack}
            ariaLabel="Volver"
            hitAreaClassName="-m-3 p-3"
          />
        )}
        <div className="relative flex-shrink-0">
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">
            <Image src="/minsa-logo.png" alt="MINSA" fill className="object-cover object-top" />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-sb-header-to bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">Asistente MINSA Digital</span>
            <Badge className="bg-white/25">Oficial</Badge>
          </div>
          <div className="truncate text-xs text-white/80">En línea · Citas en línea</div>
        </div>
        <IconButton icon={<ChevronDownIcon className="h-5 w-5" />} ariaLabel="Colapsar panel" />
      </div>
    </header>
  );
}
