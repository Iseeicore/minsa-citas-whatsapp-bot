import { Heading } from "@/app/components/ui/Heading";
import { DocumentoBloqueTipo } from "@/lib/enums/consentimiento/documento-bloque-tipo";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";
import type { DocumentoApartado, DocumentoBloque } from "@/lib/types/aceptacion-terminos.types";

const LIST_CLASS_NAME = "list-disc space-y-1 pl-5";

function LegalBlock({ bloque }: { bloque: DocumentoBloque }) {
  switch (bloque.tipo) {
    case DocumentoBloqueTipo.PARRAFO:
      return <p>{bloque.texto}</p>;
    case DocumentoBloqueTipo.SUBTITULO:
      return (
        <Heading level={4} variant={HeadingVariant.PANEL}>
          {bloque.texto}
        </Heading>
      );
    case DocumentoBloqueTipo.LISTA:
      return (
        <ul className={LIST_CLASS_NAME}>
          {bloque.items.map((item, index) => (
            <li key={index}>
              {item.texto}
              {item.subitems && (
                <ul className={LIST_CLASS_NAME}>
                  {item.subitems.map((subitem, subindex) => (
                    <li key={subindex}>{subitem}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      );
  }
}

export function LegalDocument({ apartados }: { apartados: readonly DocumentoApartado[] }) {
  return (
    <div className="flex flex-col gap-4 wrap-anywhere text-sm leading-relaxed text-slate-700">
      {apartados.map((apartado, index) => (
        <section key={index} className="flex flex-col gap-2">
          {apartado.titulo && (
            <Heading level={3} variant={HeadingVariant.DOCUMENT}>
              {apartado.titulo}
            </Heading>
          )}
          {apartado.bloques.map((bloque, blockIndex) => (
            <LegalBlock key={blockIndex} bloque={bloque} />
          ))}
        </section>
      ))}
    </div>
  );
}
