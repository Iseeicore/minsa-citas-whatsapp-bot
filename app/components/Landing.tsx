import Image from "next/image";
import { LandingHeader } from "@/app/components/landing/LandingHeader";
import { LandingHero } from "@/app/components/landing/LandingHero";
import { LandingLoginBanner } from "@/app/components/landing/LandingLoginBanner";
import { LandingServices } from "@/app/components/landing/LandingServices";

const ACCESIBILIDAD_ALT_TEXT = "Accesibilidad";

export default function Landing({ loginUrl }: { loginUrl: string }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-brand-sky bg-landing-fondo-mobile bg-cover font-poppins text-brand-navy md:bg-landing-fondo">
      <div className="mx-auto flex min-h-0 w-full max-w-landing flex-1 flex-col px-5 pb-28 md:px-10 md:pb-32">
        <LandingHeader loginUrl={loginUrl} />
        <LandingHero />
        <LandingLoginBanner loginUrl={loginUrl} />
        <LandingServices loginUrl={loginUrl} />
      </div>

      <Image
        src="/landing/accesibilidad.webp"
        alt={ACCESIBILIDAD_ALT_TEXT}
        width={200}
        height={198}
        className="fixed right-4 bottom-4 z-10 size-16 md:size-24"
      />
    </div>
  );
}
