import { isDatabaseEnabled } from "@/lib/db/persistence";
import { createMemoryConsentimientoStore, createPrismaConsentimientoStore, type ConsentimientoStore } from "@/lib/recepcion/repositorio";
import {
  createMemoryAceptacionTerminosStore,
  createPrismaAceptacionTerminosStore,
  type AceptacionTerminosStore,
} from "@/lib/terminos/aceptacion-terminos";

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
