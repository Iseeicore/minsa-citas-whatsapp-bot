import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { CANAL_ORIGEN_POR_CANAL } from "@/lib/constants/canal-origen";
import { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import { startOfTodayInLima } from "@/lib/time/lima-clock";
import type { CountIntentosDelDiaResult, CupoDiarioStore, IntentoConsulta, SaveIntentoConsultaResult } from "@/lib/types/cupo-diario.types";

type ConteoDelDia = { fecha: string; total: number };

export function createPrismaCupoDiarioStore(): CupoDiarioStore {
  return {
    save: async ({ identificador, canal, resultado }) => {
      await prisma.consultaIncidenciaIntento.create({ data: { identificador, canalOrigenId: CANAL_ORIGEN_POR_CANAL[canal], resultado } });
    },
    countDelDia: (identificador) =>
      prisma.consultaIncidenciaIntento.count({ where: { identificador, fechaCreacion: { gte: startOfTodayInLima() } } }),
  };
}

export function createMemoryCupoDiarioStore(fechaDeHoy: () => string): CupoDiarioStore {
  const conteos = new Map<string, ConteoDelDia>();
  return {
    save: async ({ identificador }) => {
      const fecha = fechaDeHoy();
      const actual = conteos.get(identificador);
      conteos.set(identificador, { fecha, total: actual?.fecha === fecha ? actual.total + 1 : 1 });
    },
    countDelDia: async (identificador) => {
      const actual = conteos.get(identificador);
      return actual?.fecha === fechaDeHoy() ? actual.total : 0;
    },
  };
}

export async function saveIntentoConsulta(intento: IntentoConsulta, store: CupoDiarioStore): Promise<SaveIntentoConsultaResult> {
  try {
    await store.save(intento);
    return { statusCupo: CupoDiarioStatus.SAVED };
  } catch (error) {
    logger.error("consulta.intento_persist_failed", { canal: intento.canal, resultado: intento.resultado, error });
    return { statusCupo: CupoDiarioStatus.FAILED };
  }
}

export async function countIntentosDelDia(identificador: string, store: CupoDiarioStore): Promise<CountIntentosDelDiaResult> {
  try {
    return { statusCupo: CupoDiarioStatus.COUNTED, total: await store.countDelDia(identificador) };
  } catch (error) {
    logger.error("consulta.cupo_count_failed", { error });
    return { statusCupo: CupoDiarioStatus.FAILED };
  }
}
