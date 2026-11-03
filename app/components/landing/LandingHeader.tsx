import Image from "next/image";
import { ChatLink } from "@/app/components/landing/ChatLink";
import { AnchorLink } from "@/app/components/ui/AnchorLink";
import { CHANNELS } from "@/lib/constants/textos/canales-oficiales";
import { SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { ButtonVariant } from "@/lib/enums/button-variant";

export function LandingHeader({ loginUrl, chatEnabled }: { loginUrl: string | undefined; chatEnabled: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 py-3 md:px-landing-gutter md:py-4">
      <Image src="/landing/logo.webp" alt={SANDBOX_PAGE_TITLE_TEXT} width={400} height={162} className="h-10 w-auto md:h-16" priority />
      <nav className="mr-auto hidden gap-8 pl-12 md:flex">
        {[
          { label: "Inicio", href: "/", opensChat: false, selected: true },
          { label: "Servicios", href: loginUrl, opensChat: false, selected: false },
          { label: "Citas en línea", href: loginUrl, opensChat: chatEnabled, selected: false },
        ].map(({ label, href, opensChat, selected }) => (
          <ChatLink key={label} href={href} opensChat={opensChat} selected={selected} variant={ButtonVariant.NAV}>
            {label}
          </ChatLink>
        ))}
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
