import Image from "next/image";
import Link from "next/link";
import { CHANNELS } from "@/lib/constants/textos/canales-oficiales";
import { SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { buttonClassName } from "@/lib/utils/button-class-name";
import { buildChatLinkProps } from "@/lib/utils/chat-link";

const LOGO_ALT_TEXT = SANDBOX_PAGE_TITLE_TEXT;

const NAV_LINK = buttonClassName({ variant: ButtonVariant.NAV });
const NAV_LINK_SELECTED = buttonClassName({ variant: ButtonVariant.NAV, selected: true });
const DNI_LINK = buttonClassName({ variant: ButtonVariant.GRADIENT_BLUE, className: "px-4 py-2 text-xs md:px-8 md:py-3 md:text-sm" });

export function LandingHeader({ loginUrl, chatEnabled }: { loginUrl: string | undefined; chatEnabled: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 py-3 md:px-landing-gutter md:py-4">
      <Image src="/landing/logo.webp" alt={LOGO_ALT_TEXT} width={400} height={162} className="h-10 w-auto md:h-16" priority />
      <nav className="mr-auto hidden gap-8 pl-12 md:flex">
        <Link href="/" className={NAV_LINK_SELECTED}>
          Inicio
        </Link>
        <a href={loginUrl} className={NAV_LINK}>
          Servicios
        </a>
        <a {...buildChatLinkProps(chatEnabled, loginUrl)} className={NAV_LINK}>
          Citas en línea
        </a>
      </nav>
      <div className="flex items-center gap-3">
        <a href={`tel:${CHANNELS.linea113}`} aria-label={`Llamar al ${CHANNELS.linea113}`}>
          <Image src="/landing/telefono.webp" alt="" width={100} height={100} className="size-9 md:size-12" />
        </a>
        <a href={loginUrl} className={DNI_LINK}>
          Ingresar con DNI
        </a>
      </div>
    </header>
  );
}
