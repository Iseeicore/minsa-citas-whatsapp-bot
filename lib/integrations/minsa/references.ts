import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { FAKE_REFERENCIAS } from "@/lib/integrations/minsa/fake-data";
import { postSigned, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";

const ESTADOS_VISIBLES = new Set([3, 5, 7]);

function isEstadoVisible(estado: unknown): estado is 3 | 5 | 7 {
  return typeof estado === "number" && ESTADOS_VISIBLES.has(estado);
}

/** `estado` llega como objeto `{codigo, descripcion}`, con `codigo` en texto (ej. "7"), no como número suelto. */
function estadoCodigoDe(raw: Record<string, unknown>): unknown {
  const estado = raw.estado;
  if (typeof estado === "object" && estado !== null) {
    const codigo = (estado as { codigo?: unknown }).codigo;
    return typeof codigo === "string" ? Number(codigo) : codigo;
  }
  return typeof estado === "string" ? Number(estado) : estado;
}

function parseReferencia(raw: Record<string, unknown>): ReferenciaItem | undefined {
  const estado = estadoCodigoDe(raw);
  if (!isEstadoVisible(estado)) return undefined;

  const ipressOrigen = raw.ipress_origen as { descripcion?: unknown } | string | undefined;
  const ipressDestino = raw.ipress_destino as { descripcion?: unknown } | string | undefined;
  const upsOrigen = raw.ups_origen as { descripcion?: unknown } | string | undefined;
  const upsDestino = raw.ups_destino as { descripcion?: unknown } | string | undefined;

  const descripcionDe = (value: { descripcion?: unknown } | string | undefined): string =>
    typeof value === "string" ? value : typeof value?.descripcion === "string" ? value.descripcion : "";

  const idReferencia = raw.id_referencia ?? raw.idReferencia;
  if (typeof idReferencia !== "string" && typeof idReferencia !== "number") return undefined;

  return {
    idReferencia: String(idReferencia),
    numero: String(raw.nro_referencia ?? raw.numero ?? ""),
    fechaInicio: String(raw.fecha_inicio ?? ""),
    ipressOrigen: descripcionDe(ipressOrigen),
    ipressDestino: descripcionDe(ipressDestino),
    upsOrigen: descripcionDe(upsOrigen),
    upsDestino: descripcionDe(upsDestino),
    estado,
  };
}

export async function listReferences(numeroDocumento: string, tipoDocumento: string): Promise<ListReferencesResult> {
  if (isRealMinsaEnabled()) {
    const response = await postSigned("/whatsapp/api/v1/references", {
      numero_documento: numeroDocumento,
      tipo_documento: tipoDocumento,
    });

    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const rawItems = body?.data ?? body?.referencias ?? body?.items ?? (Array.isArray(body) ? body : []);
    if (!Array.isArray(rawItems)) return { status: "error" };

    const items = rawItems
      .map((raw) => (typeof raw === "object" && raw !== null ? parseReferencia(raw as Record<string, unknown>) : undefined))
      .filter((item): item is ReferenciaItem => item !== undefined);

    return items.length > 0 ? { status: "found", items } : { status: "empty" };
  }

  return FAKE_REFERENCIAS.length > 0 ? { status: "found", items: FAKE_REFERENCIAS } : { status: "empty" };
}
