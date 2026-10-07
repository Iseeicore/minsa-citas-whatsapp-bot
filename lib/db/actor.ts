import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const ACTOR_SISTEMA_BOT = "sistema:bot";
export const ACTOR_EXTERNO_META = "externo:meta";
export const ACTOR_OPERADOR_BANDEJA = "operador:bandeja";

export const actorCiudadano = (waId: string) => `ciudadano:${waId}`;

/** Declara quién escribe para la auditoría de la base; va primero en `prisma.$transaction([...])` y es local a la transacción. */
export function declararActor(actor: string) {
  return prisma.$executeRaw`SELECT set_config('app.actor', ${actor}, true)`;
}

/** Igual que `declararActor`, para una transacción interactiva (`prisma.$transaction(async (tx) => ...)`). */
export function declararActorEn(tx: Prisma.TransactionClient, actor: string) {
  return tx.$executeRaw`SELECT set_config('app.actor', ${actor}, true)`;
}
