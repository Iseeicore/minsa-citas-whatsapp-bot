import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  usuarioUpsert: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ id: "u-1" })),
  incidenciaCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ id: "i-1" })),
  evidenciaCreate: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  executeRaw: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1),
  queryRaw: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => [{ total: BigInt(0) }]),
  enabled: true,
}));

vi.mock("@/lib/db/persistence", () => ({ isDatabaseEnabled: () => db.enabled }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: db.queryRaw,
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: db.executeRaw,
        usuario: { upsert: db.usuarioUpsert },
        incidenciaPaciente: { create: db.incidenciaCreate },
        evidencia: { createMany: db.evidenciaCreate },
      }),
  },
}));
vi.mock("@/lib/observability/context", () => ({ currentTraceId: () => "trace-abc" }));

import { evidenceImageMaxBytes } from "@/lib/config/evidence";
import { registrarIncidencia } from "@/lib/recepcion/servicio";
import { logger } from "@/lib/observability/logger";
import type { AlmacenEvidencias, ImagenValidada } from "@/lib/types/almacen-evidencias.types";
import { crearAlmacenEvidencias } from "@/lib/recepcion/imagenes/almacen";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";

const base = { waId: "wa-1", dni: null, descripcion: "Me cobraron de mas" };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pngDataUri = `data:image/png;base64,${PNG.toString("base64")}`;
const svgDataUri = `data:image/svg+xml;base64,${Buffer.from("<svg></svg>").toString("base64")}`;
const gifDataUri = `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`;
const pngComoJpegDataUri = `data:image/jpeg;base64,${PNG.toString("base64")}`;

const almacenFalso = () => {
  const guardar = vi.fn<(imagen: ImagenValidada) => Promise<{ ruta: string }>>(async () => ({ ruta: "2026/10/foto.png" }));
  const almacen: AlmacenEvidencias = { guardar };
  return { almacen, guardar };
};

describe("registering an incident directly in the database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
  });

  it("stores an anonymous incident from WhatsApp with no identity, signed by the citizen", async () => {
    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "accepted" });

    expect(db.executeRaw.mock.calls.map((call) => call[1])).toEqual(["ciudadano:wa-1"]);
    expect(db.usuarioUpsert).toHaveBeenCalledWith({ where: { waId: "wa-1" }, create: { waId: "wa-1" }, update: {} });
    expect(db.incidenciaCreate).toHaveBeenCalledWith({
      data: {
        canalOrigenId: 1,
        usuarioId: "u-1",
        waId: "wa-1",
        esAnonimo: true,
        dniReclamante: null,
        descripcion: "Me cobraron de mas",
        establecimientoId: null,
        traceId: "trace-abc",
      },
    });
    expect(db.evidenciaCreate).not.toHaveBeenCalled();
  });

  it("stores the real channel of origin: the Chat-bot as web and whatsapp-bot as WhatsApp", async () => {
    await registrarIncidencia({ ...base, canal: "web" }, crearAlmacenEvidencias());
    await registrarIncidencia({ ...base, canal: "whatsapp" }, crearAlmacenEvidencias());

    expect(db.incidenciaCreate.mock.calls.map(([args]) => (args as { data: { canalOrigenId: number } }).data.canalOrigenId)).toEqual([
      CanalOrigenId.WEB,
      CanalOrigenId.WHATSAPP,
    ]);
  });

  it("a submission without a channel is stored as WhatsApp", async () => {
    await registrarIncidencia(base, crearAlmacenEvidencias());

    expect(db.incidenciaCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ canalOrigenId: CanalOrigenId.WHATSAPP }) });
  });

  it("refuses an unknown channel before the database", async () => {
    for (const canal of ["telegram", "WEB", 2, null]) {
      await expect(registrarIncidencia({ ...base, canal }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    }
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("a phone that already sent the daily maximum is refused before anything is saved, and the turn is logged", async () => {
    db.queryRaw.mockResolvedValueOnce([{ total: BigInt(5) }]);

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "rejected", reason: "daily_limit" });

    expect(db.incidenciaCreate).not.toHaveBeenCalled();
    expect(db.usuarioUpsert).not.toHaveBeenCalled();
  });

  it("one below the maximum still goes through", async () => {
    db.queryRaw.mockResolvedValueOnce([{ total: BigInt(4) }]);

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "accepted" });
  });

  it("the count leaves out the incident of this same turn, so a repeated delivery of the last allowed one is not refused", async () => {
    await registrarIncidencia(base, crearAlmacenEvidencias());

    const [strings, ...values] = db.queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];
    const sql = strings.join("?");
    expect(values).toEqual(["wa-1", "trace-abc"]);
    expect(sql).toContain("trace_id <>");
    expect(sql).toContain("America/Lima");
  });

  it("a database that cannot count is an error, never a silent pass", async () => {
    db.queryRaw.mockRejectedValueOnce(new Error("connection refused"));

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("saves the establecimiento the citizen confirmed, and answers with the code the database gave", async () => {
    db.incidenciaCreate.mockResolvedValueOnce({ id: "i-1", codigo: "MINSA-2026-000123" });

    await expect(registrarIncidencia({ ...base, establecimientoId: 7 }, crearAlmacenEvidencias())).resolves.toEqual({
      status: "accepted",
      codigo: "MINSA-2026-000123",
    });

    expect(db.incidenciaCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ establecimientoId: 7 }) });
  });

  it("refuses an establecimiento id that is not a positive integer, before the database", async () => {
    for (const establecimientoId of [0, -1, 1.5, "7"]) {
      await expect(registrarIncidencia({ ...base, establecimientoId }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    }
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it.each(["12345678", "123456789"])("keeps the document %s when the citizen was identified, and writes no name", async (dni) => {
    await registrarIncidencia({ ...base, dni }, crearAlmacenEvidencias());

    expect(db.incidenciaCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ esAnonimo: false, dniReclamante: dni }),
    });
  });

  it.each(["1234567", "1234567890123", "abc12345", "123456789012"])(
    "refuses the document %j: it is neither 8 nor 9 digits",
    async (dni) => {
      await expect(registrarIncidencia({ ...base, dni }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
      expect(db.incidenciaCreate).not.toHaveBeenCalled();
    },
  );

  it("treats a repeated trace id as already stored: one incident, answered as accepted", async () => {
    db.incidenciaCreate.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "accepted" });
  });

  it("reports an error, and never a fake acceptance, when the database fails", async () => {
    db.incidenciaCreate.mockRejectedValueOnce(new Error("connection reset"));

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
  });

  it("reports an error when there is no database to store it in", async () => {
    db.enabled = false;

    await expect(registrarIncidencia(base, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed submission at the boundary without touching the database", async () => {
    await expect(registrarIncidencia({ ...base, descripcion: "" }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    await expect(registrarIncidencia({ ...base, dni: "abc" }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });
    await expect(registrarIncidencia({ waId: "" }, crearAlmacenEvidencias())).resolves.toEqual({ status: "error" });

    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });
});

describe("the photos that go with an incident", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.enabled = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores the validated image first and its evidence in the same transaction as the incident", async () => {
    const { almacen, guardar } = almacenFalso();

    await expect(registrarIncidencia({ ...base, mediaDataUris: [pngDataUri] }, almacen)).resolves.toEqual({ status: "accepted" });

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar.mock.calls[0][0].bytes.equals(PNG)).toBe(true);
    expect(guardar.mock.calls[0][0].mimeType).toBe("image/png");
    expect(db.evidenciaCreate).toHaveBeenCalledWith({
      data: [{ incidenciaPacienteId: "i-1", tipoEvidenciaId: 1, mimeType: "image/png", tamano: PNG.length, ruta: "2026/10/foto.png" }],
    });
  });

  it("stores every image of the incident in the same transaction", async () => {
    const { almacen, guardar } = almacenFalso();

    await expect(registrarIncidencia({ ...base, mediaDataUris: [pngDataUri, pngDataUri, pngDataUri] }, almacen)).resolves.toEqual({
      status: "accepted",
    });

    expect(guardar).toHaveBeenCalledTimes(3);
    expect(db.evidenciaCreate).toHaveBeenCalledTimes(1);
    expect((db.evidenciaCreate.mock.calls[0][0] as { data: unknown[] }).data).toHaveLength(3);
  });

  it("rejects more images than the limit at the boundary", async () => {
    const { almacen, guardar } = almacenFalso();

    await expect(registrarIncidencia({ ...base, mediaDataUris: Array(6).fill(pngDataUri) }, almacen)).resolves.toEqual({ status: "error" });
    expect(guardar).not.toHaveBeenCalled();
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("rejects an oversized image as too large, and stores nothing", async () => {
    const { almacen, guardar } = almacenFalso();
    const big = Buffer.alloc(evidenceImageMaxBytes() + 1, 1).toString("base64");

    await expect(registrarIncidencia({ ...base, mediaDataUris: [`data:image/jpeg;base64,${big}`] }, almacen)).resolves.toEqual({
      status: "rejected",
      reason: "media_too_large",
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["something that is not an image", "data:text/html;base64,PGI+"],
    ["an SVG", svgDataUri],
    ["a GIF", gifDataUri],
    ["an image whose bytes do not match its declared type", pngComoJpegDataUri],
  ])("rejects %s, and stores nothing", async (_, mediaDataUri) => {
    const { almacen, guardar } = almacenFalso();

    await expect(registrarIncidencia({ ...base, mediaDataUris: [mediaDataUri] }, almacen)).resolves.toEqual({
      status: "rejected",
      reason: "other",
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("answers an error, logging it and storing nothing, when the storage fails (the citizen can retry)", async () => {
    const { almacen, guardar } = almacenFalso();
    const error = vi.spyOn(logger, "error");
    guardar.mockRejectedValueOnce(new TypeError("503"));

    await expect(registrarIncidencia({ ...base, mediaDataUris: [pngDataUri] }, almacen)).resolves.toEqual({ status: "error" });
    expect(error).toHaveBeenCalledWith("incidencia.media_upload_failed", expect.objectContaining({ error: expect.any(TypeError) }));
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });

  it("without an image service the image is stored in the database itself, as base64 in the route", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "");

    await expect(registrarIncidencia({ ...base, mediaDataUris: [pngDataUri] }, crearAlmacenEvidencias())).resolves.toEqual({
      status: "accepted",
    });

    expect(db.evidenciaCreate).toHaveBeenCalledWith({
      data: [{ incidenciaPacienteId: "i-1", tipoEvidenciaId: 1, mimeType: "image/png", tamano: PNG.length, ruta: pngDataUri }],
    });
  });

  it("without an image service, an image that is too big or is not an image is refused before saving anything", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "");
    const big = Buffer.alloc(evidenceImageMaxBytes() + 1).toString("base64");

    await expect(
      registrarIncidencia({ ...base, mediaDataUris: [`data:image/jpeg;base64,${big}`] }, crearAlmacenEvidencias()),
    ).resolves.toEqual({
      status: "rejected",
      reason: "media_too_large",
    });
    await expect(
      registrarIncidencia({ ...base, mediaDataUris: ["data:text/html;base64,PGI+"] }, crearAlmacenEvidencias()),
    ).resolves.toEqual({
      status: "rejected",
      reason: "other",
    });
    await expect(registrarIncidencia({ ...base, mediaDataUris: [svgDataUri] }, crearAlmacenEvidencias())).resolves.toEqual({
      status: "rejected",
      reason: "other",
    });
    expect(db.incidenciaCreate).not.toHaveBeenCalled();
  });
});
