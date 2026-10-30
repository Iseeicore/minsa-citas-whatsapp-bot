import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  upsert: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  incidenciaFindUnique: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  incidenciaFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { findUnique: db.findUnique, upsert: db.upsert },
    incidenciaPaciente: { findUnique: db.incidenciaFindUnique, findFirst: db.incidenciaFindFirst },
  },
}));

import {
  createMemoryConsentimientoStore,
  createPrismaConsentimientoStore,
  findCodigoPorTrace,
  findIncidenciaParaConsulta,
  marcarConsentimientoAceptado,
  tieneConsentimientoAceptado,
} from "@/lib/recepcion/repositorio";

describe("búsquedas de incidencias sin fila", () => {
  it("devuelven undefined, no null, cuando la base no tiene la fila", async () => {
    await expect(findCodigoPorTrace("trace-sin-fila")).resolves.toBeUndefined();
    await expect(
      findIncidenciaParaConsulta({ codigo: "MINSA-2026-000001", establecimientoId: 7, esAnonimo: true }),
    ).resolves.toBeUndefined();
  });
});

describe("tieneConsentimientoAceptado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("true cuando el usuario ya tiene una fecha de aceptación", async () => {
    db.findUnique.mockResolvedValue({ consentimientoAceptadoEn: new Date("2026-10-10T00:00:00.000Z") });

    await expect(tieneConsentimientoAceptado("bsuid-ana", createPrismaConsentimientoStore())).resolves.toBe(true);
    expect(db.findUnique).toHaveBeenCalledWith({ where: { waId: "bsuid-ana" }, select: { consentimientoAceptadoEn: true } });
  });

  it("false cuando nunca aceptó", async () => {
    db.findUnique.mockResolvedValue({ consentimientoAceptadoEn: null });

    await expect(tieneConsentimientoAceptado("bsuid-ana", createPrismaConsentimientoStore())).resolves.toBe(false);
  });

  it("false cuando el usuario no existe todavía", async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(tieneConsentimientoAceptado("bsuid-nueva", createPrismaConsentimientoStore())).resolves.toBe(false);
  });
});

describe("marcarConsentimientoAceptado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea el usuario si no existía, con la fecha de aceptación puesta", async () => {
    await marcarConsentimientoAceptado("bsuid-ana", createPrismaConsentimientoStore());

    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { waId: "bsuid-ana" },
        create: expect.objectContaining({ waId: "bsuid-ana", consentimientoAceptadoEn: expect.any(Date) }),
        update: expect.objectContaining({ consentimientoAceptadoEn: expect.any(Date) }),
      }),
    );
  });
});

describe("consentimiento sin base de datos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("el almacén en memoria recuerda a quien autorizó y a nadie más", async () => {
    const store = createMemoryConsentimientoStore();

    await expect(store.tieneAceptado("bsuid-ana")).resolves.toBe(false);
    await store.marcarAceptado("bsuid-ana");
    await expect(store.tieneAceptado("bsuid-ana")).resolves.toBe(true);
    await expect(store.tieneAceptado("bsuid-beto")).resolves.toBe(false);
  });
});
