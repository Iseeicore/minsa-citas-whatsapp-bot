import Image from "next/image";
import { OPEN_CHAT_LINK_PROPS } from "@/lib/constants/chat-launcher";
import { cn } from "@/lib/utils/cn";

const TITULO_TEXT = "¿Qué deseas hacer hoy?";
const BAJADA_TEXT = "Accede rápidamente a los principales servicios de salud.";

const SERVICES = [
  {
    title: "Programa tu cita presencial",
    chat: true,
    icon: "icono-cita",
    bg: "bg-landing-cita-mobile md:bg-landing-cita",
    color: "text-brand-teal",
  },
  {
    title: "Atención virtual inmediata",
    icon: "icono-virtual",
    bg: "bg-landing-virtual-mobile md:bg-landing-virtual",
    color: "text-brand-blue",
  },
  {
    title: "Más servicios",
    detail: "Historia clínica, carné de vacunación, entre otras",
    icon: "icono-servicios",
    bg: "bg-landing-servicios-mobile md:bg-landing-servicios",
    color: "text-brand-navy",
  },
];

export function LandingServices({ loginUrl }: { loginUrl: string }) {
  return (
    <>
      <h2 className="mt-4 font-gotham text-xl font-bold md:mt-5 md:text-4xl">{TITULO_TEXT}</h2>
      <p className="text-xs md:text-xl">{BAJADA_TEXT}</p>

      <ul className="mt-3 grid min-h-0 flex-1 grid-rows-3 gap-2 md:max-h-36 md:grid-cols-3 md:grid-rows-1 md:gap-7">
        {SERVICES.map(({ title, detail, icon, bg, color, chat }) => (
          <li key={title} className="min-h-0">
            <a
              {...(chat ? OPEN_CHAT_LINK_PROPS : { href: loginUrl })}
              className={cn(
                "flex h-full items-center gap-3 rounded-2xl bg-cover bg-right py-2 pl-4 max-md:pr-landing-card-art md:gap-4 md:pr-landing-card-art-md md:pl-10",
                bg,
              )}
            >
              <Image src={`/landing/${icon}.webp`} alt="" width={160} height={160} className="size-12 shrink-0 md:size-20" />
              <span className={color}>
                <span className="block font-gotham text-base leading-tight font-bold md:text-xl lg:text-2xl">{title}</span>
                {detail && <span className="hidden text-xs md:text-base lg:block">{detail}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
