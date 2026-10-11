import { ACTOR_EXTERNO_META, declararActorEn } from "@/lib/db/actor";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import type { WhatsAppValue } from "@/lib/whatsapp/webhook/payload";

export type BsuidChange = { previous: string; current: string };

/** `migrated`: se renombró; `unchanged`: ya estaba aplicado o no hay nada que mover; `conflict`: el nuevo ya existe, no se fusiona. */
export type BsuidChangeOutcome = "migrated" | "unchanged" | "conflict";

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * Cambios de BSUID que trae un valor del webhook: el campo `user_id_update` y, si Meta manda el identificador anterior, el mensaje
 * de sistema `user_changed_user_id`. Tolerante: lo que no tiene la forma esperada se ignora.
 */
export function extractBsuidChanges(value: WhatsAppValue): BsuidChange[] {
  const changes: BsuidChange[] = [];

  for (const update of Array.isArray(value.user_id_update) ? value.user_id_update : []) {
    const { previous, current } = update?.user_id ?? {};
    if (isId(previous) && isId(current) && previous !== current) changes.push({ previous, current });
  }

  for (const message of Array.isArray(value.messages) ? value.messages : []) {
    if (message?.type !== "system" || message.system?.type !== "user_changed_user_id") continue;
    const { previous_user_id: previous, user_id: current } = message.system;
    if (isId(previous) && isId(current) && previous !== current) changes.push({ previous, current });
  }

  return changes;
}

/**
 * Si Meta cambia el BSUID (la persona cambió de número), el usuario conserva su fila y sus incidencias y solo cambia su `wa_id`,
 * junto con su sesión de conversación. Idempotente: una reentrega ya no encuentra el identificador anterior. Si el identificador
 * nuevo ya tiene usuario propio NO se fusionan (no se mezclan historiales): queda como está y se avisa en el log.
 */
export async function applyBsuidChange({ previous, current }: BsuidChange): Promise<BsuidChangeOutcome> {
  return prisma.$transaction(async (tx) => {
    await declararActorEn(tx, ACTOR_EXTERNO_META);

    const anterior = await tx.usuario.findUnique({ where: { waId: previous }, select: { id: true } });
    if (!anterior) return "unchanged";

    if (await tx.usuario.findUnique({ where: { waId: current }, select: { id: true } })) {
      logger.warn("webhook.bsuid_conflict", { previous: tail(previous), current: tail(current) });
      return "conflict";
    }

    await tx.usuario.update({ where: { id: anterior.id }, data: { waId: current } });

    if (await tx.sesionConversacion.findUnique({ where: { waId: current }, select: { id: true } })) {
      await tx.sesionConversacion.deleteMany({ where: { waId: previous } });
    } else {
      await tx.sesionConversacion.updateMany({ where: { waId: previous }, data: { waId: current } });
    }

    logger.info("webhook.bsuid_updated", { previous: tail(previous), current: tail(current) });
    return "migrated";
  });
}

/** Aplica todos los cambios de un valor del webhook; un fallo se registra y no afecta al resto ni a los mensajes. */
export async function processBsuidChanges(value: WhatsAppValue): Promise<void> {
  for (const change of extractBsuidChanges(value)) {
    try {
      await applyBsuidChange(change);
    } catch (error) {
      logger.error("webhook.bsuid_update_failed", { previous: tail(change.previous), current: tail(change.current), error });
    }
  }
}
