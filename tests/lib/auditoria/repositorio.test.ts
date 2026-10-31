import { describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => [{ cerradas: 3 }]));

vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { cerrarOperacionesInterrumpidas } from "@/lib/auditoria/repositorio";

describe("cerrarOperacionesInterrumpidas", () => {
  it("llama a la función de la base con la antigüedad y el lote como parámetros y devuelve cuántas cerró", async () => {
    await expect(cerrarOperacionesInterrumpidas(3_600_000, 1000)).resolves.toBe(3);

    const [plantilla, ...valores] = queryRaw.mock.calls[0];
    expect((plantilla as TemplateStringsArray).join("?")).toContain("auditoria.cerrar_operaciones_interrumpidas(");
    expect(valores).toEqual([3_600_000, 1000]);
  });
});
