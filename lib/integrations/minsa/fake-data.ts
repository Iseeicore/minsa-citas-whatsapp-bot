import type {
  EspecialidadItem,
  EstablecimientoItem,
  FechaItem,
  HoraItem,
  ReferenciaItem,
  UbigeoItem,
} from "@/lib/integrations/minsa/types";
import { LIMA_TIME_ZONE } from "@/lib/time/lima-clock";

export const FAKE_DNI = "12345678";
export const FAKE_CARNET_EXTRANJERIA = "123456789";
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
    timeZone: LIMA_TIME_ZONE,
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

export const FAKE_REFERENCIAS_DNI = "32028036";

export const FAKE_REFERENCIAS: ReferenciaItem[] = [
  {
    idReferencia: "1364486",
    numero: "00123",
    fechaInicio: "24/07/2024 23:03",
    ipressOrigen: "SAN FERNANDO",
    ipressDestino: "HOSPITAL MARIA AUXILIADORA",
    upsOrigen: "MEDICINA GENERAL",
    upsDestino: "GASTROENTEROLOGÍA",
    codigoIpressDestino: "5987",
    codigoUpsDestino: "222800",
    estado: 7,
  },
  {
    idReferencia: "1364275",
    numero: "00125",
    fechaInicio: "12/02/2024 15:34",
    ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
    ipressDestino: "SAN FERNANDO",
    upsOrigen: "CIRUGÍA GENERAL",
    upsDestino: "GINECOLOGÍA Y OBSTETRICIA",
    codigoIpressDestino: "5966",
    codigoUpsDestino: "221500",
    estado: 3,
  },
  {
    idReferencia: "1364178",
    numero: "00275",
    fechaInicio: "24/11/2023 10:08",
    ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
    ipressDestino: "HOSPITAL NACIONAL  DOS DE MAYO",
    upsOrigen: "",
    upsDestino: "",
    codigoIpressDestino: "6206",
    codigoUpsDestino: "230101",
    estado: 5,
  },
  {
    idReferencia: "1364177",
    numero: "00115",
    fechaInicio: "24/11/2023 09:50",
    ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
    ipressDestino: "SAN FERNANDO",
    upsOrigen: "CIRUGÍA GENERAL",
    upsDestino: "GINECOLOGÍA Y OBSTETRICIA",
    codigoIpressDestino: "5966",
    codigoUpsDestino: "221500",
    estado: 3,
  },
  {
    idReferencia: "1363465",
    numero: "00149",
    fechaInicio: "19/01/2023 16:38",
    ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
    ipressDestino: "HOSPITAL NACIONAL  DOS DE MAYO",
    upsOrigen: "",
    upsDestino: "",
    codigoIpressDestino: "6206",
    codigoUpsDestino: "230103",
    estado: 5,
  },
  {
    idReferencia: "1363463",
    numero: "00079",
    fechaInicio: "19/01/2023 15:57",
    ipressOrigen: "HOSPITAL MARIA AUXILIADORA",
    ipressDestino: "SAN FERNANDO",
    upsOrigen: "CIRUGÍA GENERAL",
    upsDestino: "MEDICINA GENERAL",
    codigoIpressDestino: "5966",
    codigoUpsDestino: "222400",
    estado: 3,
  },
];
