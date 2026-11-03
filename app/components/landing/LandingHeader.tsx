import Image from "next/image";
import { ChatLink } from "@/app/components/landing/ChatLink";
import { AnchorLink } from "@/app/components/ui/AnchorLink";
import { LinkButton } from "@/app/components/ui/LinkButton";
import { CHANNELS } from "@/lib/constants/textos/canales-oficiales";
import { SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { ButtonVariant } from "@/lib/enums/button-variant";

export function LandingHeader({ loginUrl, chatEnabled }: { loginUrl: string | undefined; chatEnabled: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 py-3 md:px-landing-gutter md:py-4">
      <Image src="/landing/logo.webp" alt={SANDBOX_PAGE_TITLE_TEXT} width={400} height={162} className="h-10 w-auto md:h-16" priority />
      <nav className="mr-auto hidden gap-8 pl-12 md:flex">
        <LinkButton href="/" variant={ButtonVariant.NAV} selected>
          Inicio
        </LinkButton>
        <AnchorLink href={loginUrl} variant={ButtonVariant.NAV}>
          Servicios
        </AnchorLink>
        <ChatLink opensChat={chatEnabled} loginUrl={loginUrl} variant={ButtonVariant.NAV}>
          Citas en línea
        </ChatLink>
      </nav>
      <div className="flex items-center gap-3">
        <AnchorLink href={`tel:${CHANNELS.linea113}`} aria-label={`Llamar al ${CHANNELS.linea113}`}>
          <Image src="/landing/telefono.webp" alt="" width={100} height={100} className="size-9 md:size-12" />
        </AnchorLink>
        <AnchorLink href={loginUrl} variant={ButtonVariant.GRADIENT_BLUE} className="px-4 py-2 text-xs md:px-8 md:py-3 md:text-sm">
          Ingresar con DNI
        </AnchorLink>
      </div>
    </header>
  );
}
