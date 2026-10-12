import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { isRawRow, parseRows, readNumber, readString, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postSigned, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";

const ESTADOS_VISIBLES: ReadonlySet<number> = new Set([3, 5, 7]);
const STATUS_CONOCIDOS: ReadonlySet<string> = new Set(Object.values(ReferenceStatus));

/**
 * Respuesta de `/references` ya leída. El servicio devuelve hoy un arreglo suelto de filas; el sobre acordado
 * con el backend es `{ status_reference, message, data }`. `statusReference` y `message` solo existen en el sobre.
 */
type ReferenciasResponse = {
  statusReference?: string;
  message?: string;
  rows: readonly unknown[];
};

type ReferenciaRow = Omit<ReferenciaItem, "estado"> & { estado: number };

function readResponse(body: unknown): ReferenciasResponse | undefined {
  if (Array.isArray(body)) return { rows: body };
  if (!isRawRow(body)) return undefined;

  const rows = body.data ?? [];
  if (!Array.isArray(rows)) return undefined;
  return { statusReference: readString(body, "status_reference"), message: readString(body, "message"), rows };
}

function descripcionDe(value: unknown): string {
  return isRawRow(value) ? (readString(value, "descripcion") ?? "") : "";
}

function codigoDe(value: unknown): string {
  return isRawRow(value) ? (readString(value, "codigo") ?? "") : "";
}

/** Una fila es válida con `id_referencia` y `estado.codigo`; el resto de campos puede llegar vacío. */
function parseReferencia(row: RawRow): ReferenciaRow | undefined {
  const idReferencia = readString(row, "id_referencia");
  const estado = isRawRow(row.estado) ? readNumber(row.estado, "codigo") : undefined;
  if (!idReferencia || estado === undefined) return undefined;

  return {
    idReferencia,
    numero: readString(row, "nro_referencia") ?? "",
    fechaInicio: readString(row, "fecha_inicio") ?? "",
    ipressOrigen: descripcionDe(row.ipress_origen),
    ipressDestino: descripcionDe(row.ipress_destino),
    upsOrigen: descripcionDe(row.ups_origen),
    upsDestino: descripcionDe(row.ups_destino),
    codigoIpressDestino: codigoDe(row.ipress_destino),
    codigoUpsDestino: codigoDe(row.ups_destino),
    estado,
  };
}

function isVisible(row: ReferenciaRow): row is ReferenciaItem {
  return ESTADOS_VISIBLES.has(row.estado);
}

/**
 * Único punto que decide el estado. Manda el `status_reference` del backend; si no viene, sale de las filas.
 * `found` exige al menos una referencia visible; una respuesta ilegible, un estado desconocido o filas que no
 * pasan la validación dan `error`.
 */
function toResult(response: ReferenciasResponse | undefined): ListReferencesResult {
  if (!response) return { status: "error", items: [] };

  const rows = parseRows(MinsaEndpoint.REFERENCIAS, response.rows, parseReferencia);
  const items = rows.filter(isVisible);
  const status = response.statusReference ?? (items.length > 0 ? ReferenceStatus.FOUND : ReferenceStatus.EMPTY);
  const allRowsInvalid = response.rows.length > 0 && rows.length === 0;
  if (allRowsInvalid || !STATUS_CONOCIDOS.has(status)) return { status: "error", items: [] };

  const message = response.message ? { message: response.message } : {};
  return status === ReferenceStatus.FOUND && items.length > 0
    ? { status: "found", items, ...message }
    : { status: "empty", items: [], ...message };
}

export async function listReferences(numeroDocumento: string, tipoDocumento: string): Promise<ListReferencesResult> {
  if (!isRealMinsaEnabled()) return { status: "empty", items: [] };

  const response = await postSigned(MinsaEndpoint.REFERENCIAS, {
    numero_documento: numeroDocumento,
    tipo_documento: tipoDocumento,
  });
  if (!response.ok) return toResult(undefined);

  const body: unknown = await response.json().catch(() => undefined);
  return toResult(readResponse(body));
}
