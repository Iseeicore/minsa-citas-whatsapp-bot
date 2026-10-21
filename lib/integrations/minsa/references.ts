import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { parseRows, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postWithBearer, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { isRecord } from "@/lib/utils/type-guards";
import { arrayOr } from "@/lib/utils/array-values";
import { readString, readNumber } from "@/lib/utils/record-readers";
import { REFERENCIAS_TIMEOUT_MS } from "@/lib/constants/limits/referencia";

const SIN_REFERENCIAS: ListReferencesResult = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const SIN_RESPUESTA: ListReferencesResult = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };
const STATUS_REFERENCE_VALUES: ReadonlySet<string> = new Set(Object.values(ReferenceStatus));

function isReferenceStatus(value: string | undefined): value is ReferenceStatus {
  return value !== undefined && STATUS_REFERENCE_VALUES.has(value);
}

function descripcionDe(value: unknown): string {
  return isRecord(value) ? (readString(value, "descripcion") ?? "") : "";
}

function codigoDe(value: unknown): string {
  return isRecord(value) ? (readString(value, "codigo") ?? "") : "";
}

function parseReferencia(row: RawRow): ReferenciaItem | undefined {
  const idReferencia = readString(row, "id_referencia");
  const estado = isRecord(row.estado) ? readNumber(row.estado, "codigo") : undefined;
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
    estadoDescripcion: descripcionDe(row.estado),
  };
}

function readBareReferences(rows: unknown[]): ListReferencesResult {
  const data = parseRows(MinsaEndpoint.REFERENCIAS, rows, parseReferencia);
  return data.length > 0 ? { statusReference: ReferenceStatus.FOUND, message: "", data } : SIN_REFERENCIAS;
}

function readReferencesResponse(body: unknown): ListReferencesResult {
  if (Array.isArray(body)) return readBareReferences(body);
  if (!isRecord(body)) return SIN_RESPUESTA;

  const statusReference = readString(body, "status_reference");
  if (!isReferenceStatus(statusReference)) return SIN_RESPUESTA;

  const rows = arrayOr(body.data);
  return {
    statusReference,
    message: readString(body, "message") ?? "",
    data: parseRows(MinsaEndpoint.REFERENCIAS, rows, parseReferencia),
  };
}

async function postReferences(numeroDocumento: string, tipoDocumento: string, bearer: string): Promise<Response | undefined> {
  try {
    return await postWithBearer(
      MinsaEndpoint.REFERENCIAS,
      {
        numero_documento: numeroDocumento,
        tipo_documento: tipoDocumento,
      },
      bearer,
      REFERENCIAS_TIMEOUT_MS,
    );
  } catch {
    return undefined;
  }
}

export async function listReferences(numeroDocumento: string, tipoDocumento: string, bearer: string): Promise<ListReferencesResult> {
  if (!isRealMinsaEnabled()) return SIN_REFERENCIAS;

  const response = await postReferences(numeroDocumento, tipoDocumento, bearer);
  if (!response?.ok) return SIN_RESPUESTA;

  const body: unknown = await response.json().catch(() => undefined);
  return readReferencesResponse(body);
}
