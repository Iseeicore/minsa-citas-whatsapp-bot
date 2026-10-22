import { z } from "zod";
import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { parseRows, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postWithBearer, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { isRecord } from "@/lib/utils/type-guards";
import { readString, readNumber } from "@/lib/utils/record-readers";

const SIN_REFERENCIAS: ListReferencesResult = { statusReference: ReferenceStatus.EMPTY, message: "", data: [] };
const SIN_RESPUESTA: ListReferencesResult = { statusReference: ReferenceStatus.ERROR, message: "", data: [] };
const referencesResponseSchema = z.array(z.unknown());

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
  };
}

function readReferencesResponse(body: unknown): ListReferencesResult {
  const parsed = referencesResponseSchema.safeParse(body);
  if (!parsed.success) return SIN_RESPUESTA;
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
  if (!isRealMinsaEnabled()) return SIN_REFERENCIAS;

  const response = await postWithBearer(
    MinsaEndpoint.REFERENCIAS,
    {
      numero_documento: numeroDocumento,
      tipo_documento: tipoDocumento,
    },
    bearer,
  );
  if (!response.ok) return SIN_RESPUESTA;

  const body: unknown = await response.json().catch(() => undefined);
  return readReferencesResponse(body);
}
