import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { declararActor } from "@/lib/db/actor";
import { runWithTrace } from "@/lib/observability/context";
import { registrarIncidencia } from "@/lib/recepcion/servicio";

const RECIBIDO = 1;
const VERIFICANDO = 2;
const VERIFICADO = 3;
const RECHAZADO = 4;

// Estas tablas no se borran: las filas quedan en la base de prueba, con identificadores únicos por corrida.
describe.skipIf(!process.env.DATABASE_URL)("upload requests and received files against a real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function nuevaSolicitud() {
    const waId = `smoke-${randomUUID()}`;
    const traceId = `trace-${randomUUID()}`;
    await runWithTrace(traceId, {}, () => registrarIncidencia({ waId, descripcion: "Reclamo con archivos adjuntos" }));
    const incidencia = await prisma.incidenciaPaciente.findUniqueOrThrow({ where: { traceId } });
    const [, solicitud] = await prisma.$transaction([
      declararActor(`ciudadano:${waId}`),
      prisma.solicitudCarga.create({
        data: {
          incidenciaPacienteId: incidencia.id,
          usuarioId: incidencia.usuarioId,
          hashToken: createHash("sha256").update(randomUUID()).digest("hex"),
          venceEn: new Date(Date.now() + 20 * 60 * 1000),
          maxArchivos: 5,
          maxBytesArchivo: 5 * 1024 * 1024,
        },
      }),
    ]);
    return { waId, incidencia, solicitud };
  }

  const recibir = (solicitudCargaId: string, waId: string, nombre: string, mime: string) =>
    prisma.$transaction([
      declararActor(`ciudadano:${waId}`),
      prisma.archivoRecibido.create({
        data: { solicitudCargaId, nombreOriginal: nombre, mimeDeclarado: mime, tamano: BigInt(1024), rutaCuarentena: `cuarentena/${randomUUID()}` },
      }),
    ]).then(([, archivo]) => archivo);

  it("issues a request signed by the citizen and receives files in the RECIBIDO state", async () => {
    const { waId, solicitud } = await nuevaSolicitud();

    expect(solicitud).toMatchObject({ cerradaEn: null, versionFila: 1, usuarioCreacion: `ciudadano:${waId}` });
    const archivo = await recibir(solicitud.id, waId, "foto.png", "image/png");
    expect(archivo).toMatchObject({ estadoArchivoId: RECIBIDO, verificadoEn: null, usuarioCreacion: `ciudadano:${waId}` });
  });

  it("walks a file to VERIFICADO with the broker as actor, and the database stamps the verification date", async () => {
    const { waId, solicitud } = await nuevaSolicitud();
    const archivo = await recibir(solicitud.id, waId, "foto.png", "image/png");

    await prisma.$transaction([declararActor("sistema:broker"), prisma.archivoRecibido.update({ where: { id: archivo.id }, data: { estadoArchivoId: VERIFICANDO } })]);
    await prisma.$transaction([
      declararActor("sistema:broker"),
      prisma.archivoRecibido.update({ where: { id: archivo.id }, data: { estadoArchivoId: VERIFICADO, mimeDetectado: "image/png", hashArchivo: "sha256-xyz" } }),
    ]);

    const final = await prisma.archivoRecibido.findUniqueOrThrow({ where: { id: archivo.id } });
    expect(final).toMatchObject({ estadoArchivoId: VERIFICADO, mimeDetectado: "image/png", usuarioModificacion: "sistema:broker" });
    expect(final.verificadoEn).toBeInstanceOf(Date);
  });

  it("surfaces the database rules to Prisma as readable errors", async () => {
    const { waId, solicitud } = await nuevaSolicitud();
    const archivo = await recibir(solicitud.id, waId, "malo.zip", "application/zip");

    await prisma.$transaction([
      declararActor("sistema:broker"),
      prisma.archivoRecibido.update({ where: { id: archivo.id }, data: { estadoArchivoId: RECHAZADO, motivoRechazo: "Tipo no permitido" } }),
    ]);

    await expect(
      prisma.$transaction([declararActor("sistema:broker"), prisma.archivoRecibido.update({ where: { id: archivo.id }, data: { estadoArchivoId: VERIFICANDO } })]),
    ).rejects.toThrow(/ya no cambia/);
    await expect(prisma.archivoRecibido.delete({ where: { id: archivo.id } })).rejects.toThrow(/no esta permitida/);
  });

  it("counts what the bot will report: received files by state for an incident", async () => {
    const { waId, incidencia, solicitud } = await nuevaSolicitud();
    const a = await recibir(solicitud.id, waId, "a.png", "image/png");
    await recibir(solicitud.id, waId, "b.pdf", "application/pdf");
    await prisma.$transaction([
      declararActor("sistema:broker"),
      prisma.archivoRecibido.update({ where: { id: a.id }, data: { estadoArchivoId: RECHAZADO, motivoRechazo: "Antivirus" } }),
    ]);

    const porEstado = await prisma.archivoRecibido.groupBy({
      by: ["estadoArchivoId"],
      where: { solicitudCarga: { incidenciaPacienteId: incidencia.id } },
      _count: { _all: true },
    });

    expect(Object.fromEntries(porEstado.map((fila) => [fila.estadoArchivoId, fila._count._all]))).toEqual({ [RECIBIDO]: 1, [RECHAZADO]: 1 });
  });

  it("closes a request once, with the database date, and never reopens it", async () => {
    const { solicitud } = await nuevaSolicitud();

    await prisma.solicitudCarga.update({ where: { id: solicitud.id }, data: { cerradaEn: new Date() } });
    const cerrada = await prisma.solicitudCarga.findUniqueOrThrow({ where: { id: solicitud.id } });
    expect(cerrada.cerradaEn).toBeInstanceOf(Date);

    await expect(prisma.solicitudCarga.update({ where: { id: solicitud.id }, data: { cerradaEn: null } })).rejects.toThrow(/una sola vez/);
  });
});
