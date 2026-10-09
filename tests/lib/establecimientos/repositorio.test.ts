import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enabled: true,
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  queryRaw: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => db.enabled }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { establecimientoSalud: { findFirst: db.findFirst }, $queryRaw: db.queryRaw },
}));

import { buscarPorCodigo, buscarPorNombre } from "@/lib/establecimientos/repositorio";

const FILA = { id: 7, areaId: 9, codigoRenipress: "6206", nombre: "HOSPITAL NACIONAL DOS DE MAYO", distrito: null };

describe("buscarPorCodigo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
  });

  it("returns the active establecimiento with that code", async () => {
    db.findFirst.mockResolvedValueOnce(FILA);
    await expect(buscarPorCodigo("6206")).resolves.toEqual({ status: "found", establecimiento: FILA });
    expect(db.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { codigoRenipress: "6206", activo: true } }));
  });

  it("an unknown or inactive code is not found", async () => {
    db.findFirst.mockResolvedValueOnce(null);
    await expect(buscarPorCodigo("99999999")).resolves.toEqual({ status: "not_found" });
  });

  it("a database failure is unavailable, never a throw", async () => {
    db.findFirst.mockRejectedValueOnce(new Error("connection refused"));
    await expect(buscarPorCodigo("6206")).resolves.toEqual({ status: "unavailable" });
  });

  it("without a database it does not touch it", async () => {
    db.enabled = false;
    await expect(buscarPorCodigo("6206")).resolves.toEqual({ status: "unavailable" });
    expect(db.findFirst).not.toHaveBeenCalled();
  });
});

describe("buscarPorNombre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
  });

  it("returns what the query finds", async () => {
    db.queryRaw.mockResolvedValueOnce([{ ...FILA, similitud: 1, similitudPalabra: 1 }]);
    await expect(buscarPorNombre("hospital dos de mayo")).resolves.toEqual({ status: "ok", candidatos: [{ ...FILA, similitud: 1, similitudPalabra: 1 }] });
  });

  it("sends the normalized text as a parameter, never glued into the SQL", async () => {
    db.queryRaw.mockResolvedValueOnce([]);
    await buscarPorNombre("Posta  SAN Borja'; DROP TABLE x;--");
    const [query] = db.queryRaw.mock.calls[0] as [{ values: unknown[]; sql: string }];
    expect(query.values).toContain("posta san borja'; drop table x;--");
    expect(query.values).toContain("puesto de salud san borja'; drop table x;--");
    expect(query.sql).not.toContain("drop table");
  });

  it("an empty text asks nothing", async () => {
    await expect(buscarPorNombre("   ")).resolves.toEqual({ status: "ok", candidatos: [] });
    expect(db.queryRaw).not.toHaveBeenCalled();
  });

  it("a database failure is unavailable, never a throw", async () => {
    db.queryRaw.mockRejectedValueOnce(new Error("timeout"));
    await expect(buscarPorNombre("hospital")).resolves.toEqual({ status: "unavailable" });
  });

  it("without a database it does not touch it", async () => {
    db.enabled = false;
    await expect(buscarPorNombre("hospital")).resolves.toEqual({ status: "unavailable" });
    expect(db.queryRaw).not.toHaveBeenCalled();
  });
});
