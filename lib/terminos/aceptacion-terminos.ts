import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
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

export type SaveAceptacionTerminosResult = { status: AceptacionTerminosStatus };

export function createPrismaAceptacionTerminosStore(): AceptacionTerminosStore {
  return {
    save: async ({ waId, canal, version }) => {
      await prisma.aceptacionTerminos.create({ data: { waId, canalOrigenId: CANAL_ORIGEN_POR_CANAL[canal], version } });
    },
  };
}

export function createMemoryAceptacionTerminosStore() {
  const aceptaciones: AceptacionTerminos[] = [];
  return {
    save: async (aceptacion: AceptacionTerminos): Promise<void> => {
      aceptaciones.push({ ...aceptacion });
    },
    list: (): readonly AceptacionTerminos[] => aceptaciones.map((aceptacion) => ({ ...aceptacion })),
  };
}

const memory = createMemoryAceptacionTerminosStore();

function defaultStore(): AceptacionTerminosStore {
  return isDatabaseEnabled() ? createPrismaAceptacionTerminosStore() : memory;
}

export async function saveAceptacionTerminos(
  aceptacion: AceptacionTerminos,
  store: AceptacionTerminosStore = defaultStore(),
): Promise<SaveAceptacionTerminosResult> {
  try {
    await store.save(aceptacion);
    return { status: AceptacionTerminosStatus.SAVED };
  } catch (error) {
    logger.error("terminos.persist_failed", { canal: aceptacion.canal, version: aceptacion.version, error });
    return { status: AceptacionTerminosStatus.FAILED };
  }
}
