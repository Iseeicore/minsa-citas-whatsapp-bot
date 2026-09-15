import type pino from "pino";
import type {
  BookAppointmentResult,
  EspecialidadOption,
  EstablecimientoOption,
  FechaOption,
  HoraOption,
  ListEspecialidadesResult,
  ListEstablecimientosResult,
  ListFechasResult,
  ListHorasResult,
  MinsaCatalogClient,
  SearchUbigeoResult,
  UbigeoOption,
} from "../ports/minsa-catalog-client.js";
import { TransientFailureError } from "../domain/errors.js";

export interface HttpMinsaCatalogClientDeps {
  config: { minsaApiHost: string };
  logger: pino.Logger;
  fetchImpl?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 10_000;

// Browser-spoofing headers, confirmed necessary against the real MINSA
// catalog endpoints (unlike validate-user/verify-code, which need none) —
// carried over verbatim from the original Twilio Functions' ground truth.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://dminsadigital.minsa.gob.pe",
  Referer: "https://dminsadigital.minsa.gob.pe/",
};

// "08:45" -> "845" (no leading zero on the hour, minute always 2 digits) —
// the exact quirky encoding the real /appointments endpoint expects,
// confirmed from the original Twilio Function source.
function toHoraCitaWireFormat(horaInicio: string): string {
  const [hh, mm] = horaInicio.split(":");
  return `${parseInt(hh, 10)}${(mm ?? "00").padStart(2, "0")}`;
}

function todayToEndOfMonthRange(): { fechaInicio: string; fechaFin: string } {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { fechaInicio: fmt(now), fechaFin: fmt(endOfMonth) };
}

// MVP fast path (explicit no-SDD/no-strict-TDD decision): one shared POST
// helper instead of six near-identical fetch blocks. Total mapping per call
// site: any non-2xx/network failure is transient; a 2xx body missing the
// expected shape is the endpoint's own "empty" business outcome, never
// thrown — same discipline as http-reniec-lookup-client.ts, just not broken
// out into per-endpoint files for speed.
async function postJson(
  fetchImpl: typeof fetch,
  logger: pino.Logger,
  url: string,
  token: string,
  body: unknown
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...BROWSER_HEADERS,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new TransientFailureError(`[minsa-catalog:http] Fallo de red al consultar ${url}`, { cause: err });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    logger.error({ url, status: response.status, body: responseBody }, "[minsa-catalog:http] MINSA respondió con error");
    throw new TransientFailureError(`[minsa-catalog:http] ${url} respondió ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createHttpMinsaCatalogClient(deps: HttpMinsaCatalogClientDeps): MinsaCatalogClient {
  const { config, logger, fetchImpl = fetch } = deps;

  return {
    async searchUbigeo(input, token): Promise<SearchUbigeoResult> {
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/api/v1/whatsapp/ubigeo`,
        token,
        { departamento: input.departamento, provincia: input.provincia, distrito: input.distrito, limite: 5 }
      );
      const raw = body as { success?: boolean; data?: unknown[] } | undefined;
      if (raw?.success !== true || !Array.isArray(raw.data) || raw.data.length === 0) {
        return { status: "ubigeo_empty" };
      }
      const options: UbigeoOption[] = raw.data.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          ubigeoInei: String(row.ubigeo_inei ?? ""),
          distrito: String(row.distrito ?? ""),
          provincia: String(row.provincia ?? ""),
          departamento: String(row.departamento ?? ""),
        };
      });
      return { status: "ubigeo_found", options };
    },

    async listEspecialidades(ubigeo, token): Promise<ListEspecialidadesResult> {
      const { fechaInicio, fechaFin } = todayToEndOfMonthRange();
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/whatsapp/api/v1/specialties-quotas`,
        token,
        { ubigeo, fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      );
      const raw = body as { success?: boolean; data?: { especialidades?: unknown[] } } | undefined;
      const list = raw?.data?.especialidades;
      if (raw?.success !== true || !Array.isArray(list) || list.length === 0) {
        return { status: "especialidades_empty" };
      }
      const options: EspecialidadOption[] = list.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          codigoEspecialidad: String(row.codigo_especialidad ?? ""),
          nombreEspecialidad: String(row.nombre_especialidad ?? ""),
          cantidadCupos: Number(row.cantidad_cupos ?? 0),
        };
      });
      return { status: "especialidades_found", options };
    },

    async listEstablecimientos(input, token): Promise<ListEstablecimientosResult> {
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/whatsapp/api/v1/establishments`,
        token,
        { especialidad_id: input.especialidadId, ubigeo: input.ubigeo, page: 1, page_size: 10 }
      );
      const raw = body as { success?: boolean; data?: { items?: unknown[] } } | undefined;
      const list = raw?.data?.items;
      if (raw?.success !== true || !Array.isArray(list) || list.length === 0) {
        return { status: "establecimientos_empty" };
      }
      const options: EstablecimientoOption[] = list.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          renipressCode: String(row.renipress_code ?? ""),
          establishmentName: String(row.establishment_name ?? ""),
          quotasOnline: Number(row.quotas_online ?? 0),
        };
      });
      return { status: "establecimientos_found", options };
    },

    async listFechas(input, token): Promise<ListFechasResult> {
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/whatsapp/api/v1/quotas/dates`,
        token,
        { cod_eess: input.codEess, especialidad_id: input.especialidadId }
      );
      const raw = body as { success?: boolean; data?: { fechas?: unknown[] } } | undefined;
      const list = raw?.data?.fechas;
      if (raw?.success !== true || !Array.isArray(list) || list.length === 0) {
        return { status: "fechas_empty" };
      }
      const options: FechaOption[] = list.map((r) => {
        const row = r as Record<string, unknown>;
        return { fechaCupo: String(row.fecha_cupo ?? ""), cantidadCupos: Number(row.cantidad_cupos ?? 0) };
      });
      return { status: "fechas_found", options };
    },

    async listHoras(input, token): Promise<ListHorasResult> {
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/whatsapp/api/v1/quotas/times`,
        token,
        { cod_eess: input.codEess, especialidad_id: input.especialidadId, fecha: input.fecha }
      );
      const raw = body as { success?: boolean; data?: { horarios?: unknown[] } } | undefined;
      const list = raw?.data?.horarios;
      if (raw?.success !== true || !Array.isArray(list) || list.length === 0) {
        return { status: "horas_empty" };
      }
      const options: HoraOption[] = list.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          horaInicio: String(row.hora_inicio ?? ""),
          horaFin: String(row.hora_fin ?? ""),
          cantidadCupos: Number(row.cantidad_cupos ?? 0),
        };
      });
      return { status: "horas_found", options };
    },

    async bookAppointment(input, token): Promise<BookAppointmentResult> {
      const body = await postJson(
        fetchImpl,
        logger,
        `${config.minsaApiHost}/whatsapp/api/v1/appointments`,
        token,
        {
          codigo_renipress: input.codigoRenipress,
          codigo_ups: input.codigoUps,
          fecha_cita: input.fechaCita,
          hora_cita: toHoraCitaWireFormat(input.horaCita),
          numero_documento_paciente: input.numeroDocumentoPaciente,
        }
      );
      const raw = body as { success?: boolean; data?: { url?: string }; message?: string } | undefined;
      if (raw?.success === true) {
        return { status: "booked", url: raw.data?.url ?? "", mensajeApi: raw.message ?? "" };
      }
      const mensaje = raw?.message ?? "";
      // Replicated verbatim, not "improved" (same D24 discipline as Reclamo's
      // quejas classification): literal substring match, no error code exists.
      if (mensaje.includes("ya tiene una cita activa en el mismo turno o servicio")) {
        return { status: "duplicate" };
      }
      return { status: "booking_rejected", motivo: mensaje || "No se pudo agendar la cita." };
    },
  };
}
