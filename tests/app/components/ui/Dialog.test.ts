import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "@/app/components/ui/Dialog";

describe("Dialog", () => {
  it("es un dialog nativo nombrado por el título que indica quien lo compone", () => {
    const markup = renderToStaticMarkup(createElement(Dialog, { onClose: () => {}, labelledBy: "titulo", className: "open:flex" }, "contenido"));

    expect(markup).toBe('<dialog aria-labelledby="titulo" class="open:flex">contenido</dialog>');
  });
});
