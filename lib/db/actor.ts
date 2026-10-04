import { prisma } from "@/lib/db/prisma";

export const ACTOR_SISTEMA_BOT = "sistema:bot";
export const ACTOR_EXTERNO_META = "externo:meta";
export const ACTOR_OPERADOR_BANDEJA = "operador:bandeja";

export const actorCiudadano = (waId: string) => `ciudadano:${waId}`;

/**
 * Declara quién escribe para las columnas de auditoría que llena la base. Va como primer paso de un
 * `prisma.$transaction([...])`: el valor es local a la transacción, así que funciona detrás de un pooler.
 */
export function declararActor(actor: string) {
  return prisma.$executeRaw`SELECT set_config('app.actor', ${actor}, true)`;
}
