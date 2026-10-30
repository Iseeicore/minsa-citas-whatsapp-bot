import { isDatabaseEnabled } from "@/lib/db/persistence";
import { createMemoryConsentimientoStore, createPrismaConsentimientoStore } from "@/lib/recepcion/repositorio";
import type { ConsentimientoStore } from "@/lib/types/consentimiento.types";
import type { AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import { createMemoryAceptacionTerminosStore, createPrismaAceptacionTerminosStore } from "@/lib/terminos/aceptacion-terminos";

type MemoryStores = { consentimiento: ConsentimientoStore; aceptacionTerminos: AceptacionTerminosStore };

let memoryStores: MemoryStores | undefined;

function getMemoryStores(): MemoryStores {
  memoryStores ??= { consentimiento: createMemoryConsentimientoStore(), aceptacionTerminos: createMemoryAceptacionTerminosStore() };
  return memoryStores;
}

export function getConsentimientoStore(): ConsentimientoStore {
  return isDatabaseEnabled() ? createPrismaConsentimientoStore() : getMemoryStores().consentimiento;
}

export function getAceptacionTerminosStore(): AceptacionTerminosStore {
  return isDatabaseEnabled() ? createPrismaAceptacionTerminosStore() : getMemoryStores().aceptacionTerminos;
}
