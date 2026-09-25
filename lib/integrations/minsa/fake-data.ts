import type {
  EspecialidadItem,
  EstablecimientoItem,
  FechaItem,
  HoraItem,
  UbigeoItem,
} from "@/lib/integrations/minsa/types";

// ---- Fake catalog (used when SANDBOX_USE_REAL_MINSA !== "true") -------

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

// A day `daysAhead` from now in LIMA's calendar (the citizen's, not the
// server's) as YYYYMMDD, so the fake dates never go stale and never land on
// "today" (which would hide morning slots that already started).
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

// The third fake day has ONE horario, to try by hand the confirmation asked
// before booking a lone horario ("Solo hay un horario disponible…").
export const SINGLE_HORARIO_DAYS_AHEAD = 3;

export function fakeFechas(): FechaItem[] {
  return [
    { fechaCupo: limaDatePlus(1), cantidadCupos: 5 },
    { fechaCupo: limaDatePlus(2), cantidadCupos: 3 },
    { fechaCupo: limaDatePlus(SINGLE_HORARIO_DAYS_AHEAD), cantidadCupos: 2 },
  ];
}

// Chosen so every typed-time case can be tried by hand:
//  "1" -> position 1 (08:00) or 1 PM (13:00): two-button question;
//  "8" -> no option 8, the only 8 o'clock slot is 08:00;  "3" -> position 3 = 13:00;
//  "9" -> 09:30;  "en la tarde" -> only 13:00;  "a la 1" / "1 pm" -> 13:00.
export const FAKE_HORAS: HoraItem[] = [
  { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
  { horaInicio: "09:30", horaFin: "10:00", cantidadCupos: 1 },
  { horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 },
];
