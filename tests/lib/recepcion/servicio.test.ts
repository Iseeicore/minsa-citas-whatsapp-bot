import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  usuarioUpsert: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ id: "u-1" })),
  incidenciaCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ id: "i-1" })),
  evidenciaCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  executeRaw: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
  enabled: true,
  storageConfigured: true,
  guardarImagen: vi.fn<(bytes: Buffer, mimeType: string) => Promise<{ ruta: string }>>(async () => ({ ruta: "2026/10/foto.png" })),
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => db.enabled }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: db.executeRaw,
        usuario: { upsert: db.usuarioUpsert },
        incidenciaPaciente: { create: db.incidenciaCreate },
        evidencia: { create: db.evidenciaCreate },
      }),
  },
}));
vi.mock("@/lib/observability/context", () => ({ currentTraceId: () => "trace-abc" }));
vi.mock("@/lib/recepcion/imagenes/config", () => ({ isMediaStorageConfigured: () => db.storageConfigured }));
vi.mock("@/lib/recepcion/imagenes/almacen-http", () => ({ guardarImagenHttp: db.guardarImagen }));

import { MAX_IMAGE_BYTES } from "@/lib/recepcion/imagenes/data-uri";
import { registrarIncidencia } from "@/lib/recepcion/servicio";

const base = { waId: "wa-1", dni: null, nombreCompleto: null, descripcion: "Me cobraron de mas" };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const pngDataUri = `data:image/png;base64,${PNG.toString("base64")}`;

describe("registering an incident directly in the database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
    db.storageConfigured = true;
  });

  it("stores an anonymous incident from WhatsApp with no identity, signed by the citizen", async () => {
    await expect(registrarIncidencia(base)).resolves.toEqual({ status: "accepted" });

    expect(db.executeRaw.mock.calls.map((call) => call[1])).toEqual(["ciudadano:wa-1"]);
    expect(db.usuarioUpsert).toHaveBeenCalledWith({ where: { waId: "wa-1" }, create: { waId: "wa-1" }, update: {} });
    expect(db.incidenciaCreate).toHaveBeenCalledWith({
      data: {
        canalOrigenId: 1,
        usuarioId: "u-1",
        waId: "wa-1",
        esAnonimo: true,
        dniReclamante: null,
        nombreReclamante: null,
        descripcion: "Me cobraron de mas",
        traceId: "trace-abc",
      },
    });
    expect(db.evidenciaCreate).not.toHaveBeenCalled();
  });

  it("is not anonymous when the citizen gave a name, even without a DNI", async () => {
    await registrarIncidencia({ ...base, nombreCompleto: "Ana Torres" });

    expect(db.incidenciaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ esAnonimo: false, nombreReclamante: "Ana Torres", dniReclamante: null }),
    });
  });

  it("keeps the DNI when the citizen was identified", async () => {
    await registrarIncidencia({ ...base, dni: "12345678", nombreCompleto: "Ana Torres" });

    expect(db.incidenciaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ esAnonimo: false, dniReclamante: "12345678" }),
    });
  });

  it("treats a repeated trace id as already stored: one incident, answered as accepted", async () => {
    db.incidenciaCreate.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(registrarIncidencia(base)).resolves.toEqual({ status: "accepted" });
  });

  it("reports an error, and never a fake acceptance, when the database fails", async () => {
    db.incidenciaCreate.mockRejectedValueOnce(new Error("connection reset"));

    await expect(registrarIncidencia(base)).resolves.toEqual({ status: "error" });
  });

  it("reports an error when there is no database to store it in", async () => {
    db.enabled = false;

    await expect(registrarIncidencia(base)).resolves.toEqual({ status: "error" });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed submission at the boundary without touching the database", async () => {
    await expect(registrarIncidencia({ ...base, descripcion: "" })).resolves.toEqual({ status: "error" });
    await expect(registrarIncidencia({ ...base, dni: "abc" })).resolves.toEqual({ status: "error" });
    await expect(registrarIncidencia({ waId: "" })).resolves.toEqual({ status: "error" });

    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });
});

describe("the photo that goes with an incident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
    db.storageConfigured = true;
  });

  it("uploads the image first and stores its evidence in the same transaction as the incident", async () => {
    await expect(registrarIncidencia({ ...base, mediaDataUri: pngDataUri })).resolves.toEqual({ status: "accepted" });

    expect(db.guardarImagen).toHaveBeenCalledTimes(1);
    expect(db.guardarImagen.mock.calls[0][0].equals(PNG)).toBe(true);
    expect(db.guardarImagen.mock.calls[0][1]).toBe("image/png");
    expect(db.evidenciaCreate).toHaveBeenCalledWith({
      data: { incidenciaPacienteId: "i-1", tipoEvidenciaId: 1, mimeType: "image/png", tamano: PNG.length, ruta: "2026/10/foto.png" },
    });
  });

  it("rejects an oversized image as too large, and stores nothing", async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");

    await expect(registrarIncidencia({ ...base, mediaDataUri: `data:image/jpeg;base64,${big}` })).resolves.toEqual({
      status: "rejected",
      reason: "media_too_large",
    });
    expect(db.guardarImagen).not.toHaveBeenCalled();
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("rejects something that is not an image, and stores nothing", async () => {
    await expect(registrarIncidencia({ ...base, mediaDataUri: "data:text/html;base64,PGI+" })).resolves.toEqual({
      status: "rejected",
      reason: "other",
    });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("answers an error, storing nothing, when the image service fails (the citizen can retry)", async () => {
    db.guardarImagen.mockRejectedValueOnce(new Error("503"));

    await expect(registrarIncidencia({ ...base, mediaDataUri: pngDataUri })).resolves.toEqual({ status: "error" });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("stores the incident without evidence when no image service is configured", async () => {
    db.storageConfigured = false;

    await expect(registrarIncidencia({ ...base, mediaDataUri: pngDataUri })).resolves.toEqual({ status: "accepted" });
    expect(db.guardarImagen).not.toHaveBeenCalled();
    expect(db.evidenciaCreate).not.toHaveBeenCalled();
  });
});
