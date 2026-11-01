import { isFlagEnabled } from "@/lib/utils/env-flags";

const isFlagOn = (value: string | undefined): boolean => isFlagEnabled(value?.trim().toLowerCase());

export function isIncidenciasEnabled(): boolean {
  return isFlagOn(process.env.INCIDENCIAS_ENABLED);
}

export function isReferenciasEnabled(): boolean {
  return isFlagOn(process.env.REFERENCIAS_ENABLED);
}

export function isTerminosEnabled(): boolean {
  return isFlagOn(process.env.TERMINOS_ENABLED);
}
