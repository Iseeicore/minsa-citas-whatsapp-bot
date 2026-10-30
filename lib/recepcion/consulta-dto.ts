import { ESTADO_LEGIBLE_TEXTS, ESTADO_EN_PROCESO_TEXT } from "@/lib/constants/textos/consulta";
import { LookupStatus } from "@/lib/enums/lookup-status";

export type ConsultaIncidenciaResult =
  | { status: LookupStatus.FOUND; codigo: string; estado: string; fechaRegistro: string }
  | { status: LookupStatus.NOT_FOUND }
  | { status: LookupStatus.ERROR };

export function estadoLegible(codigoEstado: string): string {
  return ESTADO_LEGIBLE_TEXTS[codigoEstado] ?? ESTADO_EN_PROCESO_TEXT;
}

export function fechaLegible(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha);
}
