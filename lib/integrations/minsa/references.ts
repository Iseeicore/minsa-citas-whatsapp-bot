import { z } from "zod";
import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { parseRows, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postWithBearer, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { isRecord } from "@/lib/utils/type-guards";
import { readString, readNumber } from "@/lib/utils/record-readers";
import { logger } from "@/lib/observability/logger";
import { HTTP_UNAUTHORIZED } from "@/lib/constants/http-status";

const SIN_REFERENCIAS: ListReferencesResult = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const SIN_RESPUESTA: ListReferencesResult = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };
const NO_DISPONIBLE: ListReferencesResult = { statusReference: ReferenceStatus.UNAVAILABLE, message: "", data: [] };
const SESION_VENCIDA: ListReferencesResult = { statusReference: ReferenceStatus.UNAUTHORIZED, message: "", data: [] };
const referencesResponseSchema = z.array(z.unknown());

function descripcionDe(value: unknown): string {
  return isRecord(value) ? (readString(value, "descripcion") ?? "") : "";
}

function codigoDe(value: unknown): string {
  return isRecord(value) ? (readString(value, "codigo") ?? "") : "";
}

function parseReferencia(row: RawRow): ReferenciaItem | undefined {
  const idReferencia = readString(row, "id_referencia");
  const numero = readString(row, "nro_referencia");
  const fechaInicio = readString(row, "fecha_inicio");
  const estado = isRecord(row.estado) ? readNumber(row.estado, "codigo") : undefined;
  if (!idReferencia || !numero || !fechaInicio || estado === undefined) return undefined;

  return {
    idReferencia,
    numero,
    fechaInicio,
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

function readReferencesResponse(body: unknown): ListReferencesResult {
  const parsed = referencesResponseSchema.safeParse(body);
  if (!parsed.success) {
    logger.error("minsa.catalog.contract_mismatch", { endpoint: MinsaEndpoint.REFERENCIAS, reason: "rows_missing" });
    return SIN_RESPUESTA;
  }
  if (parsed.data.length === 0) return SIN_REFERENCIAS;

  const data = parseRows(MinsaEndpoint.REFERENCIAS, parsed.data, parseReferencia);
  if (data.length === 0) return SIN_RESPUESTA;
  return {
    statusReference: ReferenceStatus.FOUND,
    message: "",
    data,
  };
}

export async function listReferences(numeroDocumento: string, tipoDocumento: string, bearer: string): Promise<ListReferencesResult> {
  if (!isRealMinsaEnabled()) return NO_DISPONIBLE;

  const response = await postWithBearer(
    MinsaEndpoint.REFERENCIAS,
    {
      numero_documento: numeroDocumento,
      tipo_documento: tipoDocumento,
    },
    bearer,
  );
  if (response.status === HTTP_UNAUTHORIZED) return SESION_VENCIDA;
  if (!response.ok) return SIN_RESPUESTA;

  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    logger.error("minsa.catalog.contract_mismatch", { endpoint: MinsaEndpoint.REFERENCIAS, reason: "unreadable_body", error });
    return SIN_RESPUESTA;
  }
  return readReferencesResponse(body);
}
