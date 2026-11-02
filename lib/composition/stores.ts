import { isDatabaseEnabled } from "@/lib/db/persistence";
import type { AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import type { CupoDiarioStore } from "@/lib/types/cupo-diario.types";
import type { DniVerificadoStore } from "@/lib/types/dni-verificado.types";
import { createMemoryAceptacionTerminosStore, createPrismaAceptacionTerminosStore } from "@/lib/terminos/aceptacion-terminos";
import { createMemoryCupoDiarioStore, createPrismaCupoDiarioStore } from "@/lib/consulta/cupo-diario";
import { createMemoryDniVerificadoStore, createPrismaDniVerificadoStore } from "@/lib/usuario/dni-verificado";
import { nowInLima } from "@/lib/time/lima-clock";

type MemoryStores = {
  aceptacionTerminos: AceptacionTerminosStore;
  cupoDiario: CupoDiarioStore;
  dniVerificado: DniVerificadoStore;
};

let memoryStores: MemoryStores | undefined;

function getMemoryStores(): MemoryStores {
  memoryStores ??= {
    aceptacionTerminos: createMemoryAceptacionTerminosStore(),
    cupoDiario: createMemoryCupoDiarioStore(() => nowInLima().fecha),
    dniVerificado: createMemoryDniVerificadoStore(),
  };
  return memoryStores;
}

export function getAceptacionTerminosStore(): AceptacionTerminosStore {
  return isDatabaseEnabled() ? createPrismaAceptacionTerminosStore() : getMemoryStores().aceptacionTerminos;
}

export function getCupoDiarioStore(): CupoDiarioStore {
  return isDatabaseEnabled() ? createPrismaCupoDiarioStore() : getMemoryStores().cupoDiario;
}

export function getDniVerificadoStore(): DniVerificadoStore {
  return isDatabaseEnabled() ? createPrismaDniVerificadoStore() : getMemoryStores().dniVerificado;
}
