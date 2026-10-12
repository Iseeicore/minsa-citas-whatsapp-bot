import { EstablecimientoDecision } from "@/lib/enums/establecimiento-decision";
export type Establecimiento = {
  id: number;
  areaId: number;
  codigoRenipress: string;
  nombre: string;
  distrito: string | null;
};

export type Candidato = Establecimiento & { similitud: number; similitudPalabra: number };

export const MIN_SIMILITUD = 0.3;
export const MIN_SIMILITUD_PALABRA = 0.9;
export const SIMILITUD_EXACTA = 0.8;
export const VENTAJA_CLARA = 0.25;
export const SIMILITUD_CON_VENTAJA = 0.5;

export type Decision =
  | { kind: `${EstablecimientoDecision.NINGUNO}` }
  | { kind: `${EstablecimientoDecision.UNO}`; establecimiento: Candidato }
  | { kind: `${EstablecimientoDecision.VARIOS}`; total: number };

const esCandidato = (fila: Candidato) => fila.similitud >= MIN_SIMILITUD || fila.similitudPalabra >= MIN_SIMILITUD_PALABRA;

export function decidirCandidatos(filas: Candidato[]): Decision {
  const candidatos = filas
    .filter(esCandidato)
    .sort((a, b) => b.similitud - a.similitud || b.similitudPalabra - a.similitudPalabra);
  if (candidatos.length === 0) return { kind: EstablecimientoDecision.NINGUNO };

  const [primero, segundo] = candidatos;
  if (candidatos.length === 1) return { kind: EstablecimientoDecision.UNO, establecimiento: primero };
  if (primero.similitud >= SIMILITUD_EXACTA) return { kind: EstablecimientoDecision.UNO, establecimiento: primero };
  if (primero.similitud >= SIMILITUD_CON_VENTAJA && primero.similitud - segundo.similitud >= VENTAJA_CLARA) {
    return { kind: EstablecimientoDecision.UNO, establecimiento: primero };
  }
  return { kind: EstablecimientoDecision.VARIOS, total: candidatos.length };
}
