import type { AceptacionTerminosStore } from "@/lib/types/aceptacion-terminos.types";
import type { ConsentimientoStore } from "@/lib/types/consentimiento.types";
import type { CupoDiarioStore } from "@/lib/types/cupo-diario.types";

export const getConsentimientoStore = (): ConsentimientoStore => ({
  tieneAceptado: async () => false,
  marcarAceptado: async () => undefined,
});

export const getAceptacionTerminosStore = (): AceptacionTerminosStore => ({ save: async () => undefined });

export const getCupoDiarioStore = (): CupoDiarioStore => ({ save: async () => undefined, countDelDia: async () => 0 });
