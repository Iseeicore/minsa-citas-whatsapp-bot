import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, type ButtonProps } from "@/app/components/ui/Button";
import { IconButton } from "@/app/components/ui/IconButton";
import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";

const render = (props: ButtonProps, children?: string) => renderToStaticMarkup(createElement(Button, props, children));

describe("Button", () => {
  it("siempre es de tipo button, para no enviar un formulario por accidente", () => {
    expect(render({}, "Aceptar")).toBe(
      '<button type="button" class="rounded-xl bg-sb-navy font-semibold text-white transition-colors hover:bg-sb-navy-dark px-3 py-2 text-sm">Aceptar</button>',
    );
  });

  it("arma el aspecto con la variante, el tamaño y el ancho", () => {
    const markup = render({ variant: ButtonVariant.OUTLINE, size: ButtonSize.SM, width: ButtonWidth.GROW }, "Anteriores");

    expect(markup).toContain('class="flex-1 rounded-xl border border-sb-navy bg-white');
    expect(markup).toContain("px-3 py-1.5 text-xs");
  });

  it("sin estilo no escribe el atributo class", () => {
    expect(render({ variant: ButtonVariant.UNSTYLED }, "Try again")).toBe('<button type="button">Try again</button>');
  });

  it("deshabilitado lleva el atributo disabled y habilitado no", () => {
    expect(render({ disabled: true }, "Enviar")).toContain("disabled");
    expect(render({ disabled: false }, "Enviar")).not.toContain("disabled=");
  });

  it("cargando se deshabilita y muestra la etiqueta de carga", () => {
    const markup = render({ loading: true, loadingLabel: "Cerrando…" }, "Cerrar conversación");

    expect(markup).toContain('disabled=""');
    expect(markup).toContain(">Cerrando…<");
    expect(markup).not.toContain("Cerrar conversación");
  });

  it("cargando sin etiqueta de carga conserva el contenido", () => {
    expect(render({ loading: true }, "Cerrar conversación")).toContain(">Cerrar conversación<");
  });

  it("pone el ícono inicial antes del contenido y el final después, y solo entonces se vuelve flex", () => {
    const start = render({ iconStart: createElement("i", null, "a"), size: ButtonSize.SM }, "Texto");
    const end = render({ iconEnd: createElement("i", null, "z"), size: ButtonSize.SM }, "Texto");

    expect(start).toContain("<i>a</i>Texto</button>");
    expect(end).toContain(">Texto<i>z</i></button>");
    expect(start).toContain("flex items-center justify-center gap-1");
    expect(render({ size: ButtonSize.SM }, "Texto")).not.toContain("items-center");
  });

  it("marca la fila seleccionada", () => {
    expect(render({ variant: ButtonVariant.ROW, selected: true }, "Fila")).toContain("bg-teal-50");
    expect(render({ variant: ButtonVariant.ROW }, "Fila")).not.toContain("bg-teal-50");
  });

  it("deja pasar los atributos nativos de accesibilidad y la posición que decide el contenedor", () => {
    const markup = render(
      { variant: ButtonVariant.SWITCH_TRACK, role: "switch", "aria-checked": true, "aria-label": "Modo", className: "fixed right-4" },
      "x",
    );

    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="Modo"');
    expect(markup).toContain("fixed right-4");
  });
});

describe("IconButton", () => {
  it("exige una etiqueta accesible y usa el control de ventana por defecto", () => {
    const markup = renderToStaticMarkup(createElement(IconButton, { icon: createElement("i"), ariaLabel: "Cerrar" }));

    expect(markup).toBe(
      '<button type="button" aria-label="Cerrar" class="flex-shrink-0 rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"><i></i></button>',
    );
  });

  it("el sólido toma tamaño y se puede deshabilitar", () => {
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        icon: createElement("i"),
        ariaLabel: "Enviar mensaje",
        variant: ButtonVariant.ICON_SOLID_WHATSAPP,
        size: ButtonSize.ICON_LG,
        disabled: true,
      }),
    );

    expect(markup).toContain("h-10 w-10");
    expect(markup).toContain("bg-wa-accent");
    expect(markup).toContain('disabled=""');
  });
});
