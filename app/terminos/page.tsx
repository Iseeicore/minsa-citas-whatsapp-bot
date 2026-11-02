import type { Metadata } from "next";
import { DOCUMENTOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";
import { DOCUMENTOS_SECCIONES } from "@/lib/constants/documentos-aceptacion";

export const metadata: Metadata = { title: DOCUMENTOS_TITULO_TEXT };

export default function TerminosPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 bg-white px-4 py-8 text-slate-800">
      <h1 className="text-2xl font-bold text-sb-navy">{DOCUMENTOS_TITULO_TEXT}</h1>
      {DOCUMENTOS_SECCIONES.map((seccion) => (
        <section key={seccion.ancla} id={seccion.ancla} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-sb-navy">{seccion.titulo}</h2>
          <div className="whitespace-pre-line text-sm leading-relaxed">{seccion.contenido}</div>
        </section>
      ))}
    </main>
  );
}
