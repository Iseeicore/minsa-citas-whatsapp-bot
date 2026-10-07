import { prisma } from "@/lib/db/prisma";
import { declararActorEn } from "@/lib/db/actor";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { TipoEvidenciaId } from "@/lib/enums/tipo-evidencia-id";

export type DatosIncidencia = {
  waId: string;
  dni: string | null;
  nombreCompleto: string | null;
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
