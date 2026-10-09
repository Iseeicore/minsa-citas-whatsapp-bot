import { prisma } from "@/lib/db/prisma";
import { declararActorEn } from "@/lib/db/actor";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { TipoEvidenciaId } from "@/lib/enums/tipo-evidencia-id";

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
