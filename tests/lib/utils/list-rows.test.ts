import { describe, expect, it } from "vitest";
import { filterRows, isPagerButtonSet, pagerDirection, paginateRows, splitPagerRows } from "@/lib/utils/list-rows";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { PagerDirection } from "@/lib/enums/pager-direction";

const rows = [
  { id: "1", title: "Medicina General", description: "Medicina General / Atención del Adulto · 78 cupos" },
  { id: "2", title: "Odontología General", description: "20 cupos" },
  { id: "3", title: "Pediatría", description: "Pediatría · 12 cupos" },
];

describe("filterRows", () => {
  it("sin texto devuelve todas las filas", () => {
    expect(filterRows(rows, "")).toEqual(rows);
    expect(filterRows(rows, "   ")).toEqual(rows);
  });

  it("busca en el título y en la descripción, sin distinguir mayúsculas ni tildes", () => {
    expect(filterRows(rows, "odontologia").map((row) => row.id)).toEqual(["2"]);
    expect(filterRows(rows, "ADULTO").map((row) => row.id)).toEqual(["1"]);
  });

  it("exige que todas las palabras escritas aparezcan, en cualquier orden", () => {
    expect(filterRows(rows, "general medicina").map((row) => row.id)).toEqual(["1"]);
    expect(filterRows(rows, "general pediatria")).toEqual([]);
  });
});

describe("splitPagerRows", () => {
  const withNext = [
    ...rows,
    { id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos", description: "Página 3 de 5" },
  ];

  it("sin filas de paginación devuelve todas como opciones y ningún paginador", () => {
    expect(splitPagerRows(rows)).toEqual({ items: rows });
  });

  it("separa las filas de paginación de las opciones y calcula la página actual desde la siguiente", () => {
    const result = splitPagerRows(withNext);

    expect(result.items).toEqual(rows);
    expect(result.pager).toEqual({
      prev: undefined,
      next: { id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos" },
      label: "Página 2 de 5",
    });
  });

  it("calcula la página actual desde la anterior cuando solo hay anterior", () => {
    const result = splitPagerRows([
      ...rows,
      { id: EstablecimientoPageRowId.PREV, title: "Ver anteriores", description: "Página 4 de 5" },
    ]);

    expect(result.pager?.label).toBe("Página 5 de 5");
    expect(result.pager?.prev).toEqual({ id: EstablecimientoPageRowId.PREV, title: "Ver anteriores" });
    expect(result.pager?.next).toBeUndefined();
  });

  it("con anterior y siguiente conserva ambos y usa la siguiente para la etiqueta", () => {
    const result = splitPagerRows([
      ...rows,
      { id: EstablecimientoPageRowId.PREV, title: "Ver anteriores", description: "Página 1 de 5" },
      { id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos", description: "Página 3 de 5" },
    ]);

    expect(result.pager?.label).toBe("Página 2 de 5");
    expect(result.pager?.prev?.id).toBe(EstablecimientoPageRowId.PREV);
    expect(result.pager?.next?.id).toBe(EstablecimientoPageRowId.NEXT);
  });

  it("si la descripción no tiene el formato esperado, no inventa etiqueta", () => {
    const result = splitPagerRows([
      ...rows,
      { id: EstablecimientoPageRowId.NEXT, title: "Ver más establecimientos", description: "otra cosa" },
    ]);

    expect(result.pager?.label).toBeUndefined();
  });
});

describe("isPagerButtonSet y pagerDirection", () => {
  it("reconoce los botones de paginación de listas y de horarios", () => {
    expect(isPagerButtonSet([{ id: ListPageButtonId.NEXT, title: "Ver más opciones" }])).toBe(true);
    expect(
      isPagerButtonSet([
        { id: HoraPageButtonId.PREV, title: "Horarios anteriores" },
        { id: HoraPageButtonId.NEXT, title: "Ver más horarios" },
      ]),
    ).toBe(true);
  });

  it("no trata como paginación un conjunto con botones de otra cosa, ni uno vacío", () => {
    expect(isPagerButtonSet([{ id: "cita_referencia_confirm_si", title: "Sí" }])).toBe(false);
    expect(isPagerButtonSet([{ id: ListPageButtonId.NEXT, title: "Más" }, { id: "otro", title: "Otro" }])).toBe(false);
    expect(isPagerButtonSet([])).toBe(false);
  });

  it("indica la dirección según el identificador", () => {
    expect(pagerDirection(ListPageButtonId.PREV)).toBe(PagerDirection.PREV);
    expect(pagerDirection(HoraPageButtonId.PREV)).toBe(PagerDirection.PREV);
    expect(pagerDirection(EstablecimientoPageRowId.PREV)).toBe(PagerDirection.PREV);
    expect(pagerDirection(ListPageButtonId.NEXT)).toBe(PagerDirection.NEXT);
    expect(pagerDirection(HoraPageButtonId.NEXT)).toBe(PagerDirection.NEXT);
  });
});

describe("paginateRows", () => {
  const ten = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), title: `Fila ${index + 1}` }));

  it("devuelve la primera página con el tamaño pedido y el total de páginas", () => {
    const result = paginateRows(ten, 0, 5);

    expect(result.rows.map((row) => row.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(result.page).toBe(0);
    expect(result.totalPages).toBe(2);
  });

  it("devuelve la última página aunque no esté completa", () => {
    const result = paginateRows(ten.slice(0, 7), 1, 5);

    expect(result.rows.map((row) => row.id)).toEqual(["6", "7"]);
    expect(result.totalPages).toBe(2);
  });

  it("ajusta una página fuera de rango a la última o a la primera", () => {
    expect(paginateRows(ten, 9, 5).page).toBe(1);
    expect(paginateRows(ten, -3, 5).page).toBe(0);
  });

  it("con menos filas que el tamaño hay una sola página, y sin filas también", () => {
    expect(paginateRows(ten.slice(0, 3), 0, 5)).toMatchObject({ page: 0, totalPages: 1 });
    expect(paginateRows([], 0, 5)).toEqual({ rows: [], page: 0, totalPages: 1 });
  });
});
