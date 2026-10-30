import { prisma } from "@/lib/db/prisma";
import { declararActorEn } from "@/lib/db/actor";
import { CANAL_ORIGEN_POR_CANAL } from "@/lib/constants/canal-origen";
import { TipoEvidenciaId } from "@/lib/enums/tipo-evidencia-id";
import type { IdentidadConsulta } from "@/lib/recepcion/consulta-dto";
import { SessionChannel } from "@/lib/enums/session-channel";
import type { ConsentimientoStore } from "@/lib/types/consentimiento.types";

export type DatosIncidencia = {
  waId: string;
  dni: string | null;
  establecimientoId: number | null;
  descripcion: string;
  traceId: string;
  canal: SessionChannel;
};

export type DatosEvidencia = { mimeType: string; tamano: number; ruta: string };

export type IncidenciaConsultada = { codigo: string; fechaCreacion: Date; estadoCodigo: string };

export function insertarIncidencia(datos: DatosIncidencia, evidencias: DatosEvidencia[], actor: string) {
  return prisma.$transaction(async (tx) => {
    await declararActorEn(tx, actor);
    const usuario = await tx.usuario.upsert({ where: { waId: datos.waId }, create: { waId: datos.waId }, update: {} });

    const incidencia = await tx.incidenciaPaciente.create({
      data: {
        canalOrigenId: CANAL_ORIGEN_POR_CANAL[datos.canal],
        usuarioId: usuario.id,
        waId: datos.waId,
        esAnonimo: datos.dni === null,
        dniReclamante: datos.dni,
        descripcion: datos.descripcion,
        establecimientoId: datos.establecimientoId,
        traceId: datos.traceId,
      },
    });

    if (evidencias.length > 0) {
      await tx.evidencia.createMany({
        data: evidencias.map((evidencia) => ({
          incidenciaPacienteId: incidencia.id,
          tipoEvidenciaId: TipoEvidenciaId.IMAGEN,
          mimeType: evidencia.mimeType,
          tamano: evidencia.tamano,
          ruta: evidencia.ruta,
        })),
      });
    }

    return incidencia;
  });
}

export async function contarDelDia(waId: string, excluirTraceId: string): Promise<number> {
  const filas = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
      FROM chatbot.incidencia_paciente
     WHERE wa_id = ${waId}
       AND trace_id <> ${excluirTraceId}
       AND (fecha_creacion AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date`;
  return Number(filas[0]?.total ?? 0);
}

export async function findCodigoPorTrace(traceId: string): Promise<string | undefined> {
  const fila = await prisma.incidenciaPaciente.findUnique({ where: { traceId }, select: { codigo: true } });
  return fila?.codigo;
}

export async function buscarIncidenciaDeQuienConsulta(
  codigo: string,
  identidad: IdentidadConsulta,
): Promise<IncidenciaConsultada | undefined> {
  const fila = await prisma.incidenciaPaciente.findFirst({
    where: {
      codigo,
      activo: true,
      eliminadoEn: null,
      ...(identidad.canal === SessionChannel.WHATSAPP
        ? { usuario: { waId: identidad.waId } }
        : { esAnonimo: false, dniReclamante: identidad.dni }),
    },
    select: { codigo: true, fechaCreacion: true, estadoIncidencia: { select: { codigo: true } } },
  });
  if (!fila) return undefined;
  return { codigo: fila.codigo, fechaCreacion: fila.fechaCreacion, estadoCodigo: fila.estadoIncidencia.codigo };
}

export async function listarIncidenciasDeQuienConsulta(identidad: IdentidadConsulta): Promise<IncidenciaConsultada[]> {
  const filas = await prisma.incidenciaPaciente.findMany({
    where: {
      activo: true,
      eliminadoEn: null,
      ...(identidad.canal === SessionChannel.WHATSAPP
        ? { usuario: { waId: identidad.waId } }
        : { esAnonimo: false, dniReclamante: identidad.dni }),
    },
    orderBy: { fechaCreacion: "desc" },
    select: { codigo: true, fechaCreacion: true, estadoIncidencia: { select: { codigo: true } } },
  });
  return filas.map((fila) => ({ codigo: fila.codigo, fechaCreacion: fila.fechaCreacion, estadoCodigo: fila.estadoIncidencia.codigo }));
}

export function createPrismaConsentimientoStore(): ConsentimientoStore {
  return {
    tieneAceptado: async (waId) => {
      const usuario = await prisma.usuario.findUnique({ where: { waId }, select: { consentimientoAceptadoEn: true } });
      return usuario?.consentimientoAceptadoEn != null;
    },
    marcarAceptado: async (waId) => {
      await prisma.usuario.upsert({
        where: { waId },
        create: { waId, consentimientoAceptadoEn: new Date() },
        update: { consentimientoAceptadoEn: new Date() },
      });
    },
  };
}

export function createMemoryConsentimientoStore(): ConsentimientoStore {
  const aceptados = new Set<string>();
  return {
    tieneAceptado: async (waId) => aceptados.has(waId),
    marcarAceptado: async (waId) => {
      aceptados.add(waId);
    },
  };
}

export function tieneConsentimientoAceptado(waId: string, store: ConsentimientoStore): Promise<boolean> {
  return store.tieneAceptado(waId);
}

export function marcarConsentimientoAceptado(waId: string, store: ConsentimientoStore): Promise<void> {
  return store.marcarAceptado(waId);
}
