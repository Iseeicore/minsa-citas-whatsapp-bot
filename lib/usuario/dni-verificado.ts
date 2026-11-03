import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { isValidDniFormat } from "@/lib/fsm/parsing/text/identity-format";
import { DniVerificadoStatus } from "@/lib/enums/cita/dni-verificado-status";
import type { DniVerificadoStore } from "@/lib/types/dni-verificado.types";

export function createPrismaDniVerificadoStore(): DniVerificadoStore {
  return {
    save: async (waId, dni) => {
      await prisma.usuario.upsert({ where: { waId }, create: { waId, dni }, update: { dni } });
    },
  };
}

export function createMemoryDniVerificadoStore(): DniVerificadoStore {
  const dnis = new Map<string, string>();
  return {
    save: async (waId, dni) => {
      dnis.set(waId, dni);
    },
  };
}

export async function saveDniVerificado(waId: string, documento: string, store: DniVerificadoStore): Promise<DniVerificadoStatus> {
  if (!isValidDniFormat(documento)) return DniVerificadoStatus.SKIPPED;
  try {
    await store.save(waId, documento.trim());
    return DniVerificadoStatus.SAVED;
  } catch (error) {
    logger.error("usuario.dni_persist_failed", { error });
    return DniVerificadoStatus.FAILED;
  }
}
