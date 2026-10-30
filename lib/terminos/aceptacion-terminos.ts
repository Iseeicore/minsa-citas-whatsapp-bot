import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { CANAL_ORIGEN_POR_CANAL } from "@/lib/constants/canal-origen";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import type { SessionChannel } from "@/lib/enums/session-channel";

export type AceptacionTerminos = {
  waId: string;
  canal: SessionChannel;
  version: string;
};

export type AceptacionTerminosStore = {
  save(aceptacion: AceptacionTerminos): Promise<void>;
};

export type SaveAceptacionTerminosResult = { resultado: AceptacionTerminosStatus };

export function createPrismaAceptacionTerminosStore(): AceptacionTerminosStore {
  return {
    save: async ({ waId, canal, version }) => {
      await prisma.aceptacionTerminos.create({ data: { waId, canalOrigenId: CANAL_ORIGEN_POR_CANAL[canal], version } });
    },
  };
}

export function createMemoryAceptacionTerminosStore(): AceptacionTerminosStore {
  const aceptaciones: AceptacionTerminos[] = [];
  return {
    save: async (aceptacion) => {
      aceptaciones.push({ ...aceptacion });
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
    logger.error("terminos.persist_failed", { canal: aceptacion.canal, version: aceptacion.version, error });
    return { resultado: AceptacionTerminosStatus.FAILED };
  }
}
