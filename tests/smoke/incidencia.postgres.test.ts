import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { runWithTrace } from "@/lib/observability/context";
import { registrarIncidencia } from "@/lib/recepcion/servicio";

// Las incidencias no se borran (borrado lógico) y su historial es de solo inserción: estas filas quedan en la base de prueba.
describe.skipIf(!process.env.DATABASE_URL)("registering an incident against a real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stores an anonymous incident: registered, uncategorized, signed by the citizen, with its creation history", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    const result = await runWithTrace(traceId, {}, () => registrarIncidencia({ waId, descripcion: "Me cobraron por una atencion gratuita" }));

    expect(result).toEqual({ status: "accepted" });
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

  it("stores the name the citizen gave, as a non-anonymous incident without DNI", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;

    await runWithTrace(traceId, {}, () => registrarIncidencia({ waId, nombreCompleto: "Ana Torres", descripcion: "El consultorio estaba cerrado" }));

    expect(await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } })).toMatchObject({
      esAnonimo: false,
      nombreReclamante: "Ana Torres",
      dniReclamante: null,
    });
  });

  it("a repeated turn (same trace id) leaves one incident and still answers accepted", async () => {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const submit = () => runWithTrace(traceId, {}, () => registrarIncidencia({ waId, descripcion: "Texto del reclamo" }));

    await expect(submit()).resolves.toEqual({ status: "accepted" });
    await expect(submit()).resolves.toEqual({ status: "accepted" });

    expect(await prisma.incidenciaPaciente.count({ where: { traceId } })).toBe(1);
  });

  it("refuses an invalid DNI before reaching the database", async () => {
    const waId = `smoke-${randomUUID()}`;

    await expect(registrarIncidencia({ waId, dni: "abc", descripcion: "x" })).resolves.toEqual({ status: "error" });

    expect(await prisma.incidenciaPaciente.count({ where: { waId } })).toBe(0);
  });

  it("stores the photo as evidence of the incident, by the path the image service returned", async () => {
    vi.stubEnv("MEDIA_STORAGE_BASE_URL", "https://media.example.test/files");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ruta: "2026/10/foto.png" }), { status: 201 })));
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    const result = await runWithTrace(traceId, {}, () =>
      registrarIncidencia({ waId, descripcion: "Mala atencion", mediaDataUri: `data:image/png;base64,${png.toString("base64")}` }),
    );

    expect(result).toEqual({ status: "accepted" });
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
