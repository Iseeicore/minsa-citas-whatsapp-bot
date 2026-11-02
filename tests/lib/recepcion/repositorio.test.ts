import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  incidenciaFindUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  incidenciaFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    incidenciaPaciente: { findUnique: db.incidenciaFindUnique, findFirst: db.incidenciaFindFirst },
  },
}));

import { findCodigoPorTrace, findIncidenciaParaConsulta } from "@/lib/recepcion/repositorio";

describe("búsquedas de incidencias sin fila", () => {
  it("devuelven undefined, no null, cuando la base no tiene la fila", async () => {
    await expect(findCodigoPorTrace("trace-sin-fila")).resolves.toBeUndefined();
    await expect(
      findIncidenciaParaConsulta({ codigo: "MINSA-2026-000001", establecimientoId: 7, esAnonimo: true }),
    ).resolves.toBeUndefined();
  });
});
