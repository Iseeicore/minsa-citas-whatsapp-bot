export type ConsultaIncidenciaResult =
  | { status: "found"; codigo: string; estado: string; fechaRegistro: string }
  | { status: "not_found" }
  | { status: "error" };

export type IdentidadConsulta = { canal: "whatsapp"; waId: string } | { canal: "web"; dni: string };

export type ListarIncidenciasResult =
  | { status: "found"; items: Array<{ codigo: string; estado: string; fechaRegistro: string }> }
  | { status: "empty" }
  | { status: "error" };

const ESTADO_RECIBIDA = "Recibida, pendiente de revisión";

const ESTADO_LEGIBLE: Record<string, string> = {
  REGISTRADO: ESTADO_RECIBIDA,
  CLASIFICADO: ESTADO_RECIBIDA,
  DERIVADO: "Derivada al área responsable",
  EN_GESTION: "En atención por el área responsable",
  RESUELTO: "Resuelta",
  ARCHIVADO: "Archivada",
  ANULADO: "Cerrada",
};

export function estadoLegible(codigoEstado: string): string {
  return ESTADO_LEGIBLE[codigoEstado] ?? "En proceso";
}

export function fechaLegible(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha);
}
