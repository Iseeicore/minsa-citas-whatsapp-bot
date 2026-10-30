import type { AceptacionTerminosStore } from "@/lib/terminos/aceptacion-terminos";
import type { ConsentimientoStore } from "@/lib/recepcion/repositorio";

export const getConsentimientoStore = (): ConsentimientoStore => ({
  tieneAceptado: async () => false,
  marcarAceptado: async () => undefined,
});

export const getAceptacionTerminosStore = (): AceptacionTerminosStore => ({ save: async () => undefined });
