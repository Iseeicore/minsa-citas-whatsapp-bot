import type {
  EspecialidadItem,
  EstablecimientoItem,
  FechaItem,
  HoraItem,
  UbigeoItem,
} from "@/lib/integrations/minsa/types";

export const FAKE_DNI = "12345678";
export const FAKE_TWOFA_ID = "fake-twofa-12345678";
export const FAKE_OTP = "1234";
export const FAKE_BEARER = "fake-bearer-token";

export const FAKE_UBIGEO: UbigeoItem = {
  ubigeoInei: "150118",
  distrito: "LURIGANCHO",
  provincia: "LIMA",
  departamento: "LIMA",
};

export const FAKE_ESPECIALIDADES: EspecialidadItem[] = [
  { codigoEspecialidad: "01", nombreEspecialidad: "MEDICINA GENERAL", cantidadCupos: 5 },
  { codigoEspecialidad: "02", nombreEspecialidad: "ODONTOLOGIA", cantidadCupos: 3 },
];

export const FAKE_ESTABLECIMIENTOS: EstablecimientoItem[] = [
  { renipressCode: "0000123", establishmentName: "CENTRO DE SALUD LURIGANCHO", quotasOnline: 10 },
];

export function limaDatePlus(daysAhead: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + daysAhead));
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export const SINGLE_HORARIO_DAYS_AHEAD = 3;

export function fakeFechas(): FechaItem[] {
  return [
    { fechaCupo: limaDatePlus(1), cantidadCupos: 5 },
    { fechaCupo: limaDatePlus(2), cantidadCupos: 3 },
    { fechaCupo: limaDatePlus(SINGLE_HORARIO_DAYS_AHEAD), cantidadCupos: 2 },
  ];
}

export const FAKE_HORAS: HoraItem[] = [
  { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
  { horaInicio: "09:30", horaFin: "10:00", cantidadCupos: 1 },
  { horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 },
];
