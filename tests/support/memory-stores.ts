import type { AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import type { ConsentimientoStore } from "@/lib/types/consentimiento.types";

export const getConsentimientoStore = (): ConsentimientoStore => ({
  tieneAceptado: async () => false,
  marcarAceptado: async () => undefined,
});

export const getAceptacionTerminosStore = (): AceptacionTerminosStore => ({ save: async () => undefined });
