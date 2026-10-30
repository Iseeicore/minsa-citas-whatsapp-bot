import { ACTOR_EXTERNO_META, declararActorEn } from "@/lib/db/actor";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import type { WhatsAppValue } from "@/lib/whatsapp/webhook/payload";
import { isString } from "@/lib/utils/type-guards";
import { arrayOr } from "@/lib/utils/array-values";

export type BsuidChange = { previous: string; current: string };

export type BsuidChangeOutcome = "migrated" | "unchanged" | "conflict";

const isId = (value: unknown): value is string => isString(value) && value.length > 0;

export function extractBsuidChanges(value: WhatsAppValue): BsuidChange[] {
  const changes: BsuidChange[] = [];

  for (const update of arrayOr(value.user_id_update)) {
    const { previous, current } = update?.user_id ?? {};
    if (isId(previous) && isId(current) && previous !== current) changes.push({ previous, current });
  }

  for (const message of arrayOr(value.messages)) {
    if (message?.type !== "system" || message.system?.type !== "user_changed_user_id") continue;
    const { previous_user_id: previous, user_id: current } = message.system;
    if (isId(previous) && isId(current) && previous !== current) changes.push({ previous, current });
  }

  return changes;
}

export async function applyBsuidChange({ previous, current }: BsuidChange): Promise<BsuidChangeOutcome> {
  return prisma.$transaction(async (tx) => {
    await declararActorEn(tx, ACTOR_EXTERNO_META);
    await tx.consultaIncidenciaIntento.updateMany({ where: { identificador: previous }, data: { identificador: current } });

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

export async function processBsuidChanges(value: WhatsAppValue): Promise<void> {
  for (const change of extractBsuidChanges(value)) {
    try {
      await applyBsuidChange(change);
    } catch (error) {
      logger.error("webhook.bsuid_update_failed", { previous: tail(change.previous), current: tail(change.current), error });
    }
  }
}
