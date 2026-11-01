import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { CANAL_ORIGEN_POR_CANAL } from "@/lib/constants/canal-origen";
import { AceptacionTerminosLookup } from "@/lib/enums/aceptacion-terminos-lookup";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import type { AceptacionTerminos, AceptacionTerminosRegistrada, AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";

export type SaveAceptacionTerminosResult = { resultado: AceptacionTerminosStatus };

export type FindAceptacionTerminosResult = { resultado: AceptacionTerminosLookup };

export function createPrismaAceptacionTerminosStore(): AceptacionTerminosStore {
  return {
    save: async ({ waId, canal, version, flujo }) => {
      await prisma.aceptacionTerminos.create({ data: { waId, canalOrigenId: CANAL_ORIGEN_POR_CANAL[canal], version, flujo } });
    },
    find: async (waId, version) => {
      const fila = await prisma.aceptacionTerminos.findFirst({ where: { waId, version }, select: { aceptadoEn: true } });
      return fila ?? undefined;
    },
  };
}

export function createMemoryAceptacionTerminosStore(): AceptacionTerminosStore {
  const aceptaciones: Array<AceptacionTerminos & AceptacionTerminosRegistrada> = [];
  return {
    save: async (aceptacion) => {
      aceptaciones.push({ ...aceptacion, aceptadoEn: new Date() });
    },
    find: async (waId, version) => {
      const fila = aceptaciones.find((aceptacion) => aceptacion.waId === waId && aceptacion.version === version);
      return fila ? { aceptadoEn: fila.aceptadoEn } : undefined;
    },
  };
}

export async function saveAceptacionTerminos(
  aceptacion: AceptacionTerminos,
  store: AceptacionTerminosStore,
): Promise<SaveAceptacionTerminosResult> {
  try {
    await store.save(aceptacion);
    return { resultado: AceptacionTerminosStatus.SAVED };
  } catch (error) {
    logger.error("terminos.persist_failed", { canal: aceptacion.canal, version: aceptacion.version, flujo: aceptacion.flujo, error });
    return { resultado: AceptacionTerminosStatus.FAILED };
  }
}

export async function findAceptacionTerminos(
  waId: string,
  version: string,
  store: AceptacionTerminosStore,
): Promise<FindAceptacionTerminosResult> {
  try {
    const aceptacion = await store.find(waId, version);
    return { resultado: aceptacion ? AceptacionTerminosLookup.FOUND : AceptacionTerminosLookup.NOT_FOUND };
  } catch (error) {
    logger.error("terminos.lookup_failed", { version, error });
    return { resultado: AceptacionTerminosLookup.FAILED };
  }
}
