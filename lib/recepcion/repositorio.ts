import { prisma } from "@/lib/db/prisma";
import { declararActorEn } from "@/lib/db/actor";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { TipoEvidenciaId } from "@/lib/enums/tipo-evidencia-id";
import type { IdentidadConsulta } from "@/lib/recepcion/consulta-dto";

export type DatosIncidencia = {
  waId: string;
  dni: string | null;
  nombreCompleto: string | null;
  establecimientoId: number | null;
  descripcion: string;
  traceId: string;
};

export type DatosEvidencia = { mimeType: string; tamano: number; ruta: string };

/** Único punto que escribe la incidencia; exige quién la firma. Asegura el usuario y guarda todo en una sola transacción. */
export function insertarIncidencia(datos: DatosIncidencia, evidencia: DatosEvidencia | null, actor: string) {
  return prisma.$transaction(async (tx) => {
    await declararActorEn(tx, actor);
    const usuario = await tx.usuario.upsert({ where: { waId: datos.waId }, create: { waId: datos.waId }, update: {} });

    const incidencia = await tx.incidenciaPaciente.create({
      data: {
        canalOrigenId: CanalOrigenId.WHATSAPP,
        usuarioId: usuario.id,
        waId: datos.waId,
        esAnonimo: datos.dni === null && datos.nombreCompleto === null,
        dniReclamante: datos.dni,
        nombreReclamante: datos.nombreCompleto,
        descripcion: datos.descripcion,
        establecimientoId: datos.establecimientoId,
        traceId: datos.traceId,
      },
    });

    if (evidencia) {
      await tx.evidencia.create({
        data: {
          incidenciaPacienteId: incidencia.id,
          tipoEvidenciaId: TipoEvidenciaId.IMAGEN,
          mimeType: evidencia.mimeType,
          tamano: evidencia.tamano,
          ruta: evidencia.ruta,
        },
      });
    }

    return incidencia;
  });
}

/** Cuántas incidencias envió ese teléfono hoy (día de Lima), sin contar la de este mismo turno si ya estaba guardada. */
export async function contarDelDia(waId: string, excluirTraceId: string): Promise<number> {
  const filas = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
      FROM chatbot.incidencia_paciente
     WHERE wa_id = ${waId}
       AND trace_id <> ${excluirTraceId}
       AND (fecha_creacion AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date`;
  return Number(filas[0]?.total ?? 0);
}

/** Código legible de una incidencia ya guardada con ese trace id; null si no existe. */
export async function buscarCodigoPorTrace(traceId: string): Promise<string | null> {
  const fila = await prisma.incidenciaPaciente.findUnique({ where: { traceId }, select: { codigo: true } });
  return fila?.codigo ?? null;
}

export type IncidenciaConsultada = { codigo: string; fechaCreacion: Date; estadoCodigo: string };

/**
 * Busca la incidencia por código SOLO si pertenece a quien consulta, en una sola consulta: «no existe» y «no es tuya» son
 * indistinguibles. WhatsApp compara por el usuario dueño (su wa_id actual, que sigue al usuario si Meta cambia el identificador);
 * la web compara el DNI ya verificado y excluye las anónimas.
 */
export async function buscarIncidenciaDeQuienConsulta(
  codigo: string,
  identidad: IdentidadConsulta,
): Promise<IncidenciaConsultada | null> {
  const fila = await prisma.incidenciaPaciente.findFirst({
    where: {
      codigo,
      activo: true,
      eliminadoEn: null,
      ...(identidad.canal === "whatsapp"
        ? { usuario: { waId: identidad.waId } }
        : { esAnonimo: false, dniReclamante: identidad.dni }),
    },
    select: { codigo: true, fechaCreacion: true, estadoIncidencia: { select: { codigo: true } } },
  });
  return fila ? { codigo: fila.codigo, fechaCreacion: fila.fechaCreacion, estadoCodigo: fila.estadoIncidencia.codigo } : null;
}
