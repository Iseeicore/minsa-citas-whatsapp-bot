import type { Metadata } from "next";
import { Heading } from "@/app/components/ui/Heading";
import { LegalDocument } from "@/app/components/ui/LegalDocument";
import { LogoPeru } from "@/app/components/ui/LogoPeru";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";
import { DOCUMENTOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";
import { DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";

export const metadata: Metadata = { title: DOCUMENTOS_TITULO_TEXT };

export default function TerminosPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 bg-white px-4 py-8 text-slate-800">
      <LogoPeru />
      <Heading level={1} variant={HeadingVariant.PAGE}>
        {DOCUMENTOS_TITULO_TEXT}
      </Heading>
      {DOCUMENTOS_SECCIONES.filter((seccion) => seccion.apartados.length > 0).map((seccion) => (
        <section key={seccion.ancla} id={seccion.ancla} className="flex flex-col gap-2">
          <Heading level={2} variant={HeadingVariant.SECTION}>
            {seccion.titulo}
          </Heading>
          <LegalDocument apartados={seccion.apartados} />
        </section>
      ))}
    </main>
  );
}
