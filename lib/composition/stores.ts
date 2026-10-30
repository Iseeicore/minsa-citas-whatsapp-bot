import { isDatabaseEnabled } from "@/lib/db/persistence";
import { createMemoryConsentimientoStore, createPrismaConsentimientoStore } from "@/lib/recepcion/repositorio";
import type { ConsentimientoStore } from "@/lib/types/consentimiento.types";
import type { AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import type { CupoDiarioStore } from "@/lib/types/cupo-diario.types";
import { createMemoryAceptacionTerminosStore, createPrismaAceptacionTerminosStore } from "@/lib/terminos/aceptacion-terminos";
import { createMemoryCupoDiarioStore, createPrismaCupoDiarioStore } from "@/lib/consulta/cupo-diario";
import { nowInLima } from "@/lib/time/lima-clock";

type MemoryStores = { consentimiento: ConsentimientoStore; aceptacionTerminos: AceptacionTerminosStore; cupoDiario: CupoDiarioStore };

let memoryStores: MemoryStores | undefined;

function getMemoryStores(): MemoryStores {
  memoryStores ??= {
    consentimiento: createMemoryConsentimientoStore(),
    aceptacionTerminos: createMemoryAceptacionTerminosStore(),
    cupoDiario: createMemoryCupoDiarioStore(() => nowInLima().fecha),
  };
  return memoryStores;
}

export function getConsentimientoStore(): ConsentimientoStore {
  return isDatabaseEnabled() ? createPrismaConsentimientoStore() : getMemoryStores().consentimiento;
}

export function getAceptacionTerminosStore(): AceptacionTerminosStore {
  return isDatabaseEnabled() ? createPrismaAceptacionTerminosStore() : getMemoryStores().aceptacionTerminos;
}

export function getCupoDiarioStore(): CupoDiarioStore {
  return isDatabaseEnabled() ? createPrismaCupoDiarioStore() : getMemoryStores().cupoDiario;
}
