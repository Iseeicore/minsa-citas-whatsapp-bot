import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListPicker } from "@/app/components/ui/ListPicker";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { buttonClassName } from "@/lib/utils/button-class-name";
import { toneChipClassName } from "@/lib/utils/tone-chip-class-name";

const SEARCH_FIELD = 'type="search"';
const OPTION = "<button";

const items = Array.from({ length: 7 }, (_, index) => ({
  id: `id-${index + 1}`,
  title: `Opción ${index + 1}`,
  description: index === 0 ? "Con detalle" : undefined,
}));

const render = (props: Partial<ComponentProps<typeof ListPicker>>) =>
  renderToStaticMarkup(
    createElement(ListPicker, { items, searchThreshold: 5, pageSize: 5, onSelect: () => {}, ...props }),
  );

const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;

describe("ListPicker", () => {
  it("muestra la búsqueda solo por encima del umbral", () => {
    expect(render({})).toContain(SEARCH_FIELD);
    expect(render({ searchThreshold: 7 })).not.toContain(SEARCH_FIELD);
  });

  it("muestra una página de opciones y el paginador local", () => {
    const markup = render({});

    expect(markup).toContain("Opción 5");
    expect(markup).not.toContain("Opción 6");
    expect(markup).toContain("Página 1 de 2");
    expect(markup).toContain("Siguientes");
    expect(markup).not.toContain("Anteriores");
    expect(count(markup, OPTION)).toBe(6);
  });

  it("respeta el tamaño de página que recibe", () => {
    const markup = render({ pageSize: 10 });

    expect(markup).toContain("Opción 7");
    expect(markup).not.toContain("Página");
    expect(count(markup, OPTION)).toBe(7);
  });

  it("con paginador externo muestra todos los elementos y las acciones de ese paginador", () => {
    const markup = render({ pager: { next: { id: "remoto", title: "Ver más establecimientos" }, label: "Página 2 de 5" } });

    expect(markup).toContain("Opción 7");
    expect(markup).toContain("Ver más establecimientos");
    expect(markup).toContain("Página 2 de 5");
  });

  it("presenta cada elemento con la etiqueta que da quien lo usa y conserva la descripción", () => {
    const markup = render({ presentItem: (item) => ({ label: `→ ${item.title}` }) });

    expect(markup).toContain("→ Opción 1");
    expect(markup).toContain("Con detalle");
  });

  it("sin elementos avisa que no hay coincidencias", () => {
    expect(render({ items: [] })).toContain("No hay opciones que coincidan con tu búsqueda.");
  });

  it("una fila deshabilitada no se puede elegir y se marca como tal, las demás siguen activas", () => {
    const markup = render({
      items: [
        { id: "ok", title: "Disponible", tone: ReferenciaTono.EXITO },
        { id: "no", title: "Bloqueada", tone: ReferenciaTono.NEUTRO, disabled: true },
      ],
    });

    expect(count(markup, 'aria-disabled="true"')).toBe(1);
    expect(count(markup, 'disabled=""')).toBe(1);
    expect(markup.indexOf('aria-disabled="true"')).toBeGreaterThan(markup.indexOf("Disponible"));
    expect(markup).toContain(buttonClassName({ variant: ButtonVariant.LIST_OPTION_MUTED, width: ButtonWidth.FULL }));
  });

  it("cada fila con tono muestra su ícono con el color de ese tono", () => {
    const markup = render({
      items: [
        { id: "a", title: "Aceptada", tone: ReferenciaTono.EXITO },
        { id: "b", title: "Citada", tone: ReferenciaTono.INFO },
        { id: "c", title: "Registrada", tone: ReferenciaTono.NEUTRO, disabled: true },
      ],
    });

    for (const tono of Object.values(ReferenciaTono)) expect(markup).toContain(toneChipClassName(tono));
    expect(count(markup, "<svg")).toBeGreaterThanOrEqual(3);
  });
});
