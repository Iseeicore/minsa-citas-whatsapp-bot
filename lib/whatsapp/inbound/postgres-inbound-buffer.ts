import { prisma } from "@/lib/db/prisma";
import { ACTOR_SISTEMA_BOT, declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";
import type { InboundBuffer, PendingInbound, PendingSummary } from "@/lib/whatsapp/inbound/inbound-buffer";

type ClaimedRow = {
  usuario_id: string;
  wa_message_id: string;
  contenido: string | null;
  tipo_mensaje_id: number;
  fecha_hora: Date;
  fecha_creacion: Date;
};

const ENTRANTE = DireccionMensajeId.ENTRANTE;

/** Cola de entrada sobre la tabla mensaje: pendiente es procesado_en NULL; tomar es un solo UPDATE ... RETURNING, sin sondeo. */
export function createPostgresInboundBuffer(): InboundBuffer {
  return {
    async summarize(usuarioId: string): Promise<PendingSummary> {
      const [row] = await prisma.$queryRaw<Array<{ count: number; newest: string | null; oldest: Date | null }>>`
        SELECT count(*)::int AS count,
               (array_agg(wa_message_id ORDER BY fecha_creacion DESC))[1] AS newest,
               min(fecha_creacion) AS oldest
        FROM chatbot.mensaje
        WHERE usuario_id = ${usuarioId}::uuid AND direccion_mensaje_id = ${ENTRANTE} AND procesado_en IS NULL`;

      return { count: row?.count ?? 0, newestWaMessageId: row?.newest ?? null, oldestArrivedAt: row?.oldest ?? null };
    },

    async claim(usuarioId: string, limit: number, ownerWaMessageId: string): Promise<PendingInbound[]> {
      const [, rows] = await prisma.$transaction([
        declararActor(ACTOR_SISTEMA_BOT),
        prisma.$queryRaw<ClaimedRow[]>`
          UPDATE chatbot.mensaje SET procesado_en = now()
          WHERE id IN (
            SELECT id FROM chatbot.mensaje
            WHERE usuario_id = ${usuarioId}::uuid AND direccion_mensaje_id = ${ENTRANTE} AND procesado_en IS NULL
              AND (tipo_mensaje_id = ${TipoMensajeId.TEXTO} OR wa_message_id = ${ownerWaMessageId})
            ORDER BY fecha_hora, fecha_creacion
            LIMIT ${limit}
            FOR UPDATE
          )
          RETURNING usuario_id, wa_message_id, contenido, tipo_mensaje_id, fecha_hora, fecha_creacion`,
      ]);

      return rows
        .map((row) => ({
          usuarioId: row.usuario_id,
          waMessageId: row.wa_message_id,
          contenido: row.contenido,
          tipoMensajeId: row.tipo_mensaje_id as TipoMensajeId,
          fechaHora: row.fecha_hora,
          arrivedAt: row.fecha_creacion,
        }))
        .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime() || a.arrivedAt.getTime() - b.arrivedAt.getTime());
    },

    async discard(waMessageId: string): Promise<void> {
      await prisma.$transaction([
        declararActor(ACTOR_SISTEMA_BOT),
        prisma.$executeRaw`UPDATE chatbot.mensaje SET procesado_en = now() WHERE wa_message_id = ${waMessageId} AND procesado_en IS NULL`,
      ]);
    },

    async wasRepeated(usuarioId: string, waMessageId: string, contenido: string, since: Date): Promise<boolean> {
      const rows = await prisma.$queryRaw<Array<{ existe: number }>>`
        SELECT 1 AS existe FROM chatbot.mensaje
        WHERE usuario_id = ${usuarioId}::uuid AND direccion_mensaje_id = ${ENTRANTE}
          AND wa_message_id <> ${waMessageId} AND contenido = ${contenido}
          AND procesado_en IS NOT NULL AND fecha_creacion >= ${since}
        LIMIT 1`;

      return rows.length > 0;
    },

    async expireStale(olderThan: Date): Promise<number> {
      const [, rows] = await prisma.$transaction([
        declararActor(ACTOR_SISTEMA_BOT),
        prisma.$queryRaw<Array<{ count: number }>>`
          WITH vencidos AS (
            UPDATE chatbot.mensaje SET procesado_en = now()
            WHERE direccion_mensaje_id = ${ENTRANTE} AND procesado_en IS NULL AND fecha_hora < ${olderThan}
            RETURNING 1
          )
          SELECT count(*)::int AS count FROM vencidos`,
      ]);

      return rows[0]?.count ?? 0;
    },
  };
}
