import type {
  EspecialidadItem,
  EstablecimientoItem,
  FechaItem,
  HoraItem,
  ListEspecialidadesResult,
  ListEstablecimientosResult,
  ListFechasResult,
  ListHorasResult,
  SearchUbigeoResult,
  UbigeoItem,
} from "@/lib/integrations/minsa/types";
import {
  FAKE_ESPECIALIDADES,
  FAKE_ESTABLECIMIENTOS,
  FAKE_HORAS,
  FAKE_UBIGEO,
  SINGLE_HORARIO_DAYS_AHEAD,
  fakeFechas,
  limaDatePlus,
} from "@/lib/integrations/minsa/fake-data";
import { endOfMonthYYYYMMDD, postWithBearer, todayYYYYMMDD } from "@/lib/integrations/minsa/wire";

// ---- Catalog / booking (bearer = citaBearer from verifyCode) -------------

export async function searchUbigeo(
  departamento: string,
  provincia: string,
  distrito: string,
  bearer: string,
): Promise<SearchUbigeoResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/api/v1/whatsapp/ubigeo",
      { departamento, provincia, distrito, limite: 5 },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: UbigeoItem[] = (body?.data ?? []).map((row: Record<string, unknown>) => ({
      ubigeoInei: String(row.ubigeo_inei),
      distrito: String(row.distrito),
      provincia: String(row.provincia),
      departamento: String(row.departamento),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  const matches = distrito.trim().toUpperCase() === FAKE_UBIGEO.distrito;
  return matches ? { status: "found", items: [FAKE_UBIGEO] } : { status: "empty" };
}

export async function listEspecialidades(
  ubigeo: string,
  bearer: string,
): Promise<ListEspecialidadesResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/specialties-quotas",
      { ubigeo, fecha_inicio: todayYYYYMMDD(), fecha_fin: endOfMonthYYYYMMDD() },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: EspecialidadItem[] = (body?.data?.especialidades ?? []).map(
      (row: Record<string, unknown>) => ({
        codigoEspecialidad: String(row.codigo_especialidad),
        nombreEspecialidad: String(row.nombre_especialidad),
        cantidadCupos: Number(row.cantidad_cupos),
      }),
    );

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: FAKE_ESPECIALIDADES };
}

export async function listEstablecimientos(
  especialidadId: string,
  ubigeo: string,
  bearer: string,
): Promise<ListEstablecimientosResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/establishments",
      { especialidad_id: especialidadId, ubigeo, page: 1, page_size: 10 },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: EstablecimientoItem[] = (body?.data?.items ?? []).map(
      (row: Record<string, unknown>) => ({
        renipressCode: String(row.renipress_code),
        establishmentName: String(row.establishment_name),
        quotasOnline: Number(row.quotas_online),
      }),
    );

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: FAKE_ESTABLECIMIENTOS };
}

export async function listFechas(
  codEess: string,
  especialidadId: string,
  bearer: string,
): Promise<ListFechasResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/quotas/dates",
      { cod_eess: codEess, especialidad_id: especialidadId },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: FechaItem[] = (body?.data?.fechas ?? []).map((row: Record<string, unknown>) => ({
      fechaCupo: String(row.fecha_cupo),
      cantidadCupos: Number(row.cantidad_cupos),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: fakeFechas() };
}

export async function listHoras(
  codEess: string,
  especialidadId: string,
  fecha: string,
  bearer: string,
): Promise<ListHorasResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/quotas/times",
      { cod_eess: codEess, especialidad_id: especialidadId, fecha },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: HoraItem[] = (body?.data?.horarios ?? []).map((row: Record<string, unknown>) => ({
      horaInicio: String(row.hora_inicio),
      horaFin: String(row.hora_fin),
      cantidadCupos: Number(row.cantidad_cupos),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  if (fecha === limaDatePlus(SINGLE_HORARIO_DAYS_AHEAD)) return { status: "found", items: [FAKE_HORAS[2]] };
  return { status: "found", items: FAKE_HORAS };
}
