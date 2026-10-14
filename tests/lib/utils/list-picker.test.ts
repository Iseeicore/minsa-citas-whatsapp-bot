import { describe, expect, it } from "vitest";
import { LocalPageAction } from "@/lib/enums/local-page-action";
import { buildListPickerView, localPageTarget, localPager } from "@/lib/utils/list-picker";

const twelve = Array.from({ length: 12 }, (_, index) => ({
  id: String(index + 1),
  title: `Opción ${index + 1}`,
  description: index === 11 ? "Pediatría" : undefined,
}));

const base = { items: twelve, query: "", page: 0, pageSize: 5, searchThreshold: 5 };

describe("buildListPickerView", () => {
  it("muestra la búsqueda solo cuando hay más elementos que el umbral", () => {
    expect(buildListPickerView(base).showSearch).toBe(true);
    expect(buildListPickerView({ ...base, items: twelve.slice(0, 5) }).showSearch).toBe(false);
    expect(buildListPickerView({ ...base, items: twelve.slice(0, 6) }).showSearch).toBe(true);
    expect(buildListPickerView({ ...base, searchThreshold: 12 }).showSearch).toBe(false);
  });

  it("pagina con el tamaño pedido y arma el paginador local de la primera página", () => {
    const view = buildListPickerView(base);

    expect(view.rows.map((row) => row.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(view.page).toBe(0);
    expect(view.pager).toEqual({
      prev: undefined,
      next: { id: LocalPageAction.NEXT, title: "Siguientes" },
      label: "Página 1 de 3",
    });
  });

  it("en una página intermedia ofrece anterior y siguiente, y en la última solo anterior", () => {
    const middle = buildListPickerView({ ...base, page: 1 });
    const last = buildListPickerView({ ...base, page: 2 });

    expect(middle.rows.map((row) => row.id)).toEqual(["6", "7", "8", "9", "10"]);
    expect(middle.pager).toEqual({
      prev: { id: LocalPageAction.PREV, title: "Anteriores" },
      next: { id: LocalPageAction.NEXT, title: "Siguientes" },
      label: "Página 2 de 3",
    });
    expect(last.rows.map((row) => row.id)).toEqual(["11", "12"]);
    expect(last.pager).toEqual({
      prev: { id: LocalPageAction.PREV, title: "Anteriores" },
      next: undefined,
      label: "Página 3 de 3",
    });
  });

  it("ajusta una página fuera de rango y la devuelve corregida", () => {
    expect(buildListPickerView({ ...base, page: 99 }).page).toBe(2);
    expect(buildListPickerView({ ...base, page: -1 }).page).toBe(0);
  });

  it("filtra antes de paginar y quita el paginador cuando el resultado cabe en una página", () => {
    const view = buildListPickerView({ ...base, query: "pediatria" });

    expect(view.rows.map((row) => row.id)).toEqual(["12"]);
    expect(view.pager).toBeUndefined();
    expect(view.showSearch).toBe(true);
  });

  it("sin coincidencias devuelve cero filas y ningún paginador", () => {
    const view = buildListPickerView({ ...base, query: "zzz" });

    expect(view.rows).toEqual([]);
    expect(view.pager).toBeUndefined();
  });

  it("con un paginador externo no pagina localmente: muestra todo lo filtrado y devuelve ese paginador", () => {
    const externalPager = { next: { id: "remoto_siguiente", title: "Ver más" }, label: "Página 2 de 5" };
    const view = buildListPickerView({ ...base, page: 1, externalPager });

    expect(view.rows).toHaveLength(12);
    expect(view.page).toBe(0);
    expect(view.pager).toBe(externalPager);
    expect(buildListPickerView({ ...base, query: "opcion 1", externalPager }).rows.map((row) => row.id)).toEqual(["1", "10", "11", "12"]);
  });
});

describe("localPager", () => {
  it("no existe cuando todo cabe en una página", () => {
    expect(localPager(0, 1)).toBeUndefined();
  });
});

describe("localPageTarget", () => {
  it("traduce las acciones locales a la página destino", () => {
    expect(localPageTarget(LocalPageAction.PREV, 2)).toBe(1);
    expect(localPageTarget(LocalPageAction.NEXT, 2)).toBe(3);
  });

  it("devuelve undefined para cualquier otra acción, que le corresponde a quien usa el selector", () => {
    expect(localPageTarget("cita_estab_page_next", 2)).toBeUndefined();
  });
});
