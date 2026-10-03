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
import { fetchCatalogItems } from "@/lib/integrations/minsa/catalog-pipeline";
import { readNumber, readString, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { endOfMonthYYYYMMDD, todayYYYYMMDD, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

function parseUbigeo(row: RawRow): UbigeoItem | undefined {
  const ubigeoInei = readString(row, "ubigeo_inei");
  const distrito = readString(row, "distrito");
  const provincia = readString(row, "provincia");
  const departamento = readString(row, "departamento");
  if (!ubigeoInei || !distrito || !provincia || !departamento) return undefined;
  return { ubigeoInei, distrito, provincia, departamento };
}

function parseEspecialidad(row: RawRow): EspecialidadItem | undefined {
  const codigoEspecialidad = readString(row, "codigo_especialidad");
  const nombreEspecialidad = readString(row, "nombre_especialidad");
  const cantidadCupos = readNumber(row, "cantidad_cupos");
  if (!codigoEspecialidad || !nombreEspecialidad || cantidadCupos === undefined) return undefined;
  return { codigoEspecialidad, nombreEspecialidad, cantidadCupos };
}

function parseEstablecimiento(row: RawRow): EstablecimientoItem | undefined {
  const renipressCode = readString(row, "renipress_code");
  const establishmentName = readString(row, "establishment_name");
  const quotasOnline = readNumber(row, "quotas_online");
  if (!renipressCode || !establishmentName || quotasOnline === undefined) return undefined;
  return { renipressCode, establishmentName, quotasOnline };
}

function parseFecha(row: RawRow): FechaItem | undefined {
  const fechaCupo = readString(row, "fecha_cupo");
  const cantidadCupos = readNumber(row, "cantidad_cupos");
  if (!fechaCupo || cantidadCupos === undefined) return undefined;
  return { fechaCupo, cantidadCupos };
}

function parseHora(row: RawRow): HoraItem | undefined {
  const horaInicio = readString(row, "hora_inicio");
  const horaFin = readString(row, "hora_fin");
  const cantidadCupos = readNumber(row, "cantidad_cupos");
  if (!horaInicio || !horaFin || cantidadCupos === undefined) return undefined;
  return { horaInicio, horaFin, cantidadCupos };
}

export async function searchUbigeo(
  departamento: string,
  provincia: string,
  distrito: string,
  bearer: string,
): Promise<SearchUbigeoResult> {
  if (isRealMinsaEnabled()) {
    return fetchCatalogItems({
      endpoint: MinsaEndpoint.UBIGEO,
      body: { departamento, provincia, distrito, limite: 5 },
      bearer,
      rowsPath: ["data"],
      parseRow: parseUbigeo,
    });
  }

  const matches = distrito.trim().toUpperCase() === FAKE_UBIGEO.distrito;
  return matches ? { status: "found", items: [FAKE_UBIGEO] } : { status: "empty" };
}

export async function listEspecialidades(
  ubigeo: string,
  bearer: string,
): Promise<ListEspecialidadesResult> {
  if (isRealMinsaEnabled()) {
    return fetchCatalogItems({
      endpoint: MinsaEndpoint.ESPECIALIDADES,
      body: { ubigeo, fecha_inicio: todayYYYYMMDD(), fecha_fin: endOfMonthYYYYMMDD() },
      bearer,
      rowsPath: ["data", "especialidades"],
      parseRow: parseEspecialidad,
    });
  }

  return { status: "found", items: FAKE_ESPECIALIDADES };
}

export async function listEstablecimientos(
  especialidadId: string,
  ubigeo: string,
  bearer: string,
): Promise<ListEstablecimientosResult> {
  if (isRealMinsaEnabled()) {
    return fetchCatalogItems({
      endpoint: MinsaEndpoint.ESTABLECIMIENTOS,
      body: { especialidad_id: especialidadId, ubigeo, page: 1, page_size: 10 },
      bearer,
      rowsPath: ["data", "items"],
      parseRow: parseEstablecimiento,
    });
  }

  return { status: "found", items: FAKE_ESTABLECIMIENTOS };
}

export async function listFechas(
  codEess: string,
  especialidadId: string,
  bearer: string,
): Promise<ListFechasResult> {
  if (isRealMinsaEnabled()) {
    return fetchCatalogItems({
      endpoint: MinsaEndpoint.FECHAS,
      body: { cod_eess: codEess, especialidad_id: especialidadId },
      bearer,
      rowsPath: ["data", "fechas"],
      parseRow: parseFecha,
    });
  }

  return { status: "found", items: fakeFechas() };
}

export async function listHoras(
  codEess: string,
  especialidadId: string,
  fecha: string,
  bearer: string,
): Promise<ListHorasResult> {
  if (isRealMinsaEnabled()) {
    return fetchCatalogItems({
      endpoint: MinsaEndpoint.HORAS,
      body: { cod_eess: codEess, especialidad_id: especialidadId, fecha },
      bearer,
      rowsPath: ["data", "horarios"],
      parseRow: parseHora,
    });
  }

  if (fecha === limaDatePlus(SINGLE_HORARIO_DAYS_AHEAD)) return { status: "found", items: [FAKE_HORAS[2]] };
  return { status: "found", items: FAKE_HORAS };
}
