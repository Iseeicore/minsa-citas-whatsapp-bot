import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalDocument } from "@/app/components/ui/LegalDocument";
import { DocumentoBloqueTipo } from "@/lib/enums/consentimiento/documento-bloque-tipo";

describe("LegalDocument", () => {
  it("renders each block as its own element and leaves a part without title without heading", () => {
    const markup = renderToStaticMarkup(
      createElement(LegalDocument, {
        apartados: [
          {
            titulo: "Uno",
            bloques: [
              { tipo: DocumentoBloqueTipo.SUBTITULO, texto: "Sub" },
              { tipo: DocumentoBloqueTipo.LISTA, items: [{ texto: "A", subitems: ["A1"] }, { texto: "B" }] },
            ],
          },
          { bloques: [{ tipo: DocumentoBloqueTipo.PARRAFO, texto: "Cierre" }] },
        ],
      }),
    );

    expect(markup).toContain('<h3 class="text-sm font-bold text-sb-navy">Uno</h3>');
    expect(markup).toContain('<h4 class="font-semibold text-gray-700">Sub</h4>');
    expect(markup).toContain('<li>A<ul class="list-disc space-y-1 pl-5"><li>A1</li></ul></li><li>B</li>');
    expect(markup).toContain('<section class="flex flex-col gap-2"><p>Cierre</p></section>');
  });
});
