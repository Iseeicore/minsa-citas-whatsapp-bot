/** Resultado de consultar una incidencia. Nunca lleva descripción ni datos de quien la reportó. */
export type ConsultaIncidenciaResult =
  | { status: "found"; codigo: string; estado: string; fechaRegistro: string }
  | { status: "not_found" }
  | { status: "error" };

/** Quién consulta: el usuario de WhatsApp (por su identificador actual) o un documento verificado (DNI + OTP). */
export type IdentidadConsulta = { canal: "whatsapp"; waId: string } | { canal: "web"; dni: string };

const ESTADO_RECIBIDA = "Recibida, pendiente de revisión";

/** Estado del catálogo (`catalogo.estado_incidencia.codigo`) en palabras para la persona. */
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

/** dd/mm/aaaa en hora de Lima, como se muestra al ciudadano. */
export function fechaLegible(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha);
}
