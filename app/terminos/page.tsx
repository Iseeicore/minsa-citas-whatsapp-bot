import type { Metadata } from "next";
import { TERMINOS_CONTENIDO, TERMINOS_TITULO_TEXT } from "@/lib/constants/textos/terminos";

export const metadata: Metadata = { title: TERMINOS_TITULO_TEXT };

export default function TerminosPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 bg-white px-4 py-8 text-slate-800">
      <h1 className="text-2xl font-bold text-sb-navy">{TERMINOS_TITULO_TEXT}</h1>
      <div className="whitespace-pre-line text-sm leading-relaxed">{TERMINOS_CONTENIDO}</div>
    </main>
  );
}
