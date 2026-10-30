import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { runWithTrace } from "@/lib/observability/context";
import { registrarIncidencia } from "@/lib/recepcion/servicio";
import { crearAlmacenEvidencias } from "@/lib/recepcion/imagenes/almacen";
import { createPrismaConsentimientoStore, marcarConsentimientoAceptado, tieneConsentimientoAceptado } from "@/lib/recepcion/repositorio";

describe.skipIf(!process.env.DATABASE_URL)("registering an incident against a real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("the consent of a new citizen is stored on the usuario and is read back on the next denuncia", async () => {
    const waId = `smoke-${randomUUID()}`;

    const store = createPrismaConsentimientoStore();
    await expect(tieneConsentimientoAceptado(waId, store)).resolves.toBe(false);
    await marcarConsentimientoAceptado(waId, store);

    await expect(tieneConsentimientoAceptado(waId, store)).resolves.toBe(true);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { waId } });
    expect(usuario.consentimientoAceptadoEn).toBeInstanceOf(Date);
  });

  it("stores an anonymous incident: registered, uncategorized, signed by the citizen, with its creation history", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    const result = await runWithTrace(traceId, {}, () =>
      registrarIncidencia({ waId, descripcion: "Me cobraron por una atencion gratuita" }, crearAlmacenEvidencias()),
    );

    expect(result).toEqual({ status: "accepted", codigo: expect.stringMatching(/^MINSA-\d{4}-A-\d{6,}$/) });
    const incidencia = await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } });
    expect(incidencia).toMatchObject({
      waId,
      canalOrigenId: CanalOrigenId.WHATSAPP,
      esAnonimo: true,
      dniReclamante: null,
      nombreReclamante: null,
      estadoIncidenciaId: 1,
      categoriaId: null,
      categoriaIaId: null,
      activo: true,
      versionFila: 1,
      usuarioCreacion: `ciudadano:${waId}`,
    });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { waId } });
    expect(incidencia.usuarioId).toBe(usuario.id);

    const historial = await prisma.incidenciaPacienteAuditoria.findMany({ where: { incidenciaPacienteId: incidencia.id } });
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ operacion: "CREACION", actor: `ciudadano:${waId}`, versionFila: 1 });
  });

  it("stores a denuncia from the Chat-bot with the web channel of origin", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    await runWithTrace(traceId, {}, () =>
      registrarIncidencia({ waId, descripcion: "Me cobraron por una atencion gratuita", canal: "web" }, crearAlmacenEvidencias()),
    );

    expect(await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } })).toMatchObject({ canalOrigenId: CanalOrigenId.WEB });
  });

  it.each(["12345678", "123456789"])("stores the document %s of an identified citizen, with no name yet", async (dni) => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    await runWithTrace(traceId, {}, () =>
      registrarIncidencia({ waId, dni, descripcion: "El consultorio estaba cerrado" }, crearAlmacenEvidencias()),
    );

    expect(await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } })).toMatchObject({
      esAnonimo: false,
      nombreReclamante: null,
      dniReclamante: dni,
    });
  });

  it("a repeated turn (same trace id) leaves one incident and still answers accepted", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const submit = () =>
      runWithTrace(traceId, {}, () => registrarIncidencia({ waId, descripcion: "Texto del reclamo" }, crearAlmacenEvidencias()));

    const first = await submit();
    const second = await submit();

    expect(first).toMatchObject({ status: "accepted", codigo: expect.stringMatching(/^MINSA-/) });
    expect(second).toEqual(first);

    expect(await prisma.incidenciaPaciente.count({ where: { traceId } })).toBe(1);
  });

  it("stores the establecimiento the citizen confirmed and answers with the code, the same one on a repeated turn", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const dosDeMayo = await prisma.establecimientoSalud.findUniqueOrThrow({ where: { codigoRenipress: "6206" } });
    const submit = () =>
      runWithTrace(traceId, {}, () =>
        registrarIncidencia({ waId, establecimientoId: dosDeMayo.id, descripcion: "Me cobraron sin recibo" }, crearAlmacenEvidencias()),
      );

    const first = await submit();
    const second = await submit();

    expect(first).toEqual({ status: "accepted", codigo: expect.stringMatching(/^MINSA-\d{4}-A-\d{6,}$/) });
    expect(second).toEqual(first);
    const incidencia = await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } });
    expect(incidencia.establecimientoId).toBe(dosDeMayo.id);
    expect(incidencia.codigo).toBe(first.status === "accepted" ? first.codigo : undefined);
  });

  it("an establecimiento that does not exist is refused by the database and nothing is saved", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    await expect(
      runWithTrace(traceId, {}, () => registrarIncidencia({ waId, establecimientoId: 999999, descripcion: "x" }, crearAlmacenEvidencias())),
    ).resolves.toEqual({ status: "error" });
    expect(await prisma.incidenciaPaciente.count({ where: { traceId } })).toBe(0);
  });

  it("refuses an invalid DNI before reaching the database", async () => {
    const waId = `smoke-${randomUUID()}`;

    await expect(registrarIncidencia({ waId, dni: "abc", descripcion: "x" }, crearAlmacenEvidencias())).resolves.toEqual({
      status: "error",
    });

    expect(await prisma.incidenciaPaciente.count({ where: { waId } })).toBe(0);
  });

  it("without an image service the picture is stored in the database as base64, with no schema change, and reads back byte for byte", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "");
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const dataUri = `data:image/png;base64,${png.toString("base64")}`;

    const result = await runWithTrace(traceId, {}, () =>
      registrarIncidencia({ waId, descripcion: "Mala atencion", mediaDataUris: [dataUri, dataUri] }, crearAlmacenEvidencias()),
    );

    expect(result.status).toBe("accepted");
    const incidencia = await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } });
    const [evidencia] = await prisma.evidencia.findMany({ where: { incidenciaPacienteId: incidencia.id } });
    expect(evidencia).toMatchObject({ tipoEvidenciaId: 1, mimeType: "image/png", tamano: png.length, ruta: dataUri });
    expect(Buffer.from(evidencia.ruta.split(",")[1], "base64").equals(png)).toBe(true);
  });

  it("stores the photo as evidence of the incident, by the path the image service returned", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ruta: "2026/10/foto.png" }), { status: 201 })),
    );
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    const result = await runWithTrace(traceId, {}, () =>
      registrarIncidencia(
        { waId, descripcion: "Mala atencion", mediaDataUris: [`data:image/png;base64,${png.toString("base64")}`] },
        crearAlmacenEvidencias(),
      ),
    );

    expect(result).toEqual({ status: "accepted", codigo: expect.stringMatching(/^MINSA-\d{4}-A-\d{6,}$/) });
    const incidencia = await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } });
    const evidencias = await prisma.evidencia.findMany({ where: { incidenciaPacienteId: incidencia.id } });
    expect(evidencias).toHaveLength(1);
    expect(evidencias[0]).toMatchObject({
      tipoEvidenciaId: 1,
      mimeType: "image/png",
      tamano: png.length,
      ruta: "2026/10/foto.png",
      usuarioCreacion: `ciudadano:${waId}`,
    });
  });
});
