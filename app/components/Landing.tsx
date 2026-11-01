import Image from "next/image";
import EessSearch from "@/app/components/EessSearch";
import { LandingHeader } from "@/app/components/landing/LandingHeader";
import { LandingHero } from "@/app/components/landing/LandingHero";
import { LandingServices } from "@/app/components/landing/LandingServices";
import { mapsDirectionsUrl } from "@/lib/config/maps";

const ACCESIBILIDAD_ALT_TEXT = "Accesibilidad";

export default function Landing({ loginUrl, chatEnabled }: { loginUrl: string | undefined; chatEnabled: boolean }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-brand-sky bg-landing-fondo-mobile bg-cover font-poppins text-brand-navy md:bg-landing-fondo">
      <div className="mx-auto flex min-h-0 w-full max-w-landing flex-1 flex-col px-5 pb-28 md:px-10 md:pb-32">
        <LandingHeader loginUrl={loginUrl} chatEnabled={chatEnabled} />
        <LandingHero />
        <div className="mt-3 md:mx-landing-search-gutter">
          <EessSearch directionsUrl={mapsDirectionsUrl()} />
        </div>
        <LandingServices loginUrl={loginUrl} chatEnabled={chatEnabled} />
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
