import Image from "next/image";
import { OPEN_CHAT_LINK_PROPS } from "@/lib/constants/chat-launcher";
import { cn } from "@/lib/utils/cn";

const LOGO_ALT_TEXT = "Minsa Responde";
const INICIO_LINK_TEXT = "Inicio";
const SERVICIOS_LINK_TEXT = "Servicios";
const CITAS_LINK_TEXT = "Citas en línea";
const LLAMAR_ARIA_LABEL = "Llamar al 113";
const INGRESAR_DNI_TEXT = "Ingresar con DNI";

const HOME_HREF = "#";
const EMERGENCY_PHONE_HREF = "tel:113";

const NAV_LINK = "text-sm font-semibold uppercase text-gray-600 hover:text-brand-navy";

export function LandingHeader({ loginUrl }: { loginUrl: string }) {
  return (
    <header className="flex items-center justify-between gap-4 py-3 md:px-landing-gutter md:py-4">
      <Image src="/landing/logo.webp" alt={LOGO_ALT_TEXT} width={400} height={162} className="h-10 w-auto md:h-16" priority />
      <nav className="mr-auto hidden gap-8 pl-12 md:flex">
        <a href={HOME_HREF} className={cn(NAV_LINK, "border-b-2 border-brand-navy text-brand-navy")}>
          {INICIO_LINK_TEXT}
        </a>
        <a href={loginUrl} className={NAV_LINK}>
          {SERVICIOS_LINK_TEXT}
        </a>
        <a {...OPEN_CHAT_LINK_PROPS} className={NAV_LINK}>
          {CITAS_LINK_TEXT}
        </a>
      </nav>
      <div className="flex items-center gap-3">
        <a href={EMERGENCY_PHONE_HREF} aria-label={LLAMAR_ARIA_LABEL}>
          <Image src="/landing/telefono.webp" alt="" width={100} height={100} className="size-9 md:size-12" />
        </a>
        <a
          href={loginUrl}
          className="flex items-center gap-2 rounded-lg bg-landing-dni-boton bg-cover px-4 py-2 text-xs font-bold text-white uppercase md:px-8 md:py-3 md:text-sm"
        >
          {INGRESAR_DNI_TEXT}
        </a>
      </div>
    </header>
  );
}
