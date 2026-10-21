import type { HoraSlot } from "@/lib/fsm/parsing/date/time-parser";
import type { ListReferencesResult, ReferenciaItem } from "@/lib/integrations/minsa/types";
import { isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { isString } from "@/lib/utils/type-guards";
import { DEMO_TURNO_MINUTOS } from "@/lib/constants/limits/cita";

export const DEMO_REFERENCIA_DNI = "10308523";
export const DEMO_PEDIATRIA_DNI = "47391441";

export type DemoReferencia = {
  codigo: string;
  hospital: string;
  red: string;
  ris: string;
  distrito: string;
  especialidad: string;
  codigoUps: string;
  dni: string;
  numero: string;
  fechaInicio: string;
  ipressOrigen: string;
  upsOrigen: string;
  estado: number;
  estadoDescripcion: string;
};

export const DEMO_REFERENCIAS: DemoReferencia[] = [
  {
    codigo: "00006206",
    hospital: "HOSPITAL NACIONAL DOS DE MAYO",
    red: "LIMA CENTRO",
    ris: "RIS 4",
    distrito: "Cercado de Lima",
    especialidad: "Odontología",
    codigoUps: "301101",
    dni: DEMO_REFERENCIA_DNI,
    numero: "00412",
    fechaInicio: "02/10/2026 09:15",
    ipressOrigen: "CENTRO DE SALUD SAN SEBASTIAN",
    upsOrigen: "CONSULTA EXTERNA",
    estado: 3,
    estadoDescripcion: "ACEPTADO",
  },
  {
    codigo: "00033381",
    hospital: "Hospital de Lima Este - Vitarte (III-E)",
    red: "LIMA ESTE",
    ris: "RIS Ate",
    distrito: "Ate",
    especialidad: "Cardiología",
    codigoUps: "300201",
    dni: DEMO_REFERENCIA_DNI,
    numero: "01187",
    fechaInicio: "18/09/2026 11:40",
    ipressOrigen: "CENTRO DE SALUD ATE",
    upsOrigen: "MEDICINA GENERAL",
    estado: 5,
    estadoDescripcion: "PACIENTE RECIBIDO",
  },
  {
    codigo: "00005946",
    hospital: "Hospital Nacional Hipólito Unanue",
    red: "LIMA ESTE",
    ris: "RIS Santa Anita - El Agustino",
    distrito: "El Agustino",
    especialidad: "Consulta Externa",
    codigoUps: "220000",
    dni: DEMO_REFERENCIA_DNI,
    numero: "00968",
    fechaInicio: "05/08/2026 08:30",
    ipressOrigen: "CENTRO DE SALUD EL AGUSTINO",
    upsOrigen: "CONSULTA EXTERNA",
    estado: 7,
    estadoDescripcion: "PACIENTE CITADO",
  },
  {
    codigo: "00005944",
    hospital: "HOSPITAL NACIONAL ARZOBISPO LOAYZA",
    red: "LIMA CENTRO",
    ris: "RIS 1",
    distrito: "Cercado de Lima",
    especialidad: "Neumología",
    codigoUps: "301801",
    dni: DEMO_REFERENCIA_DNI,
    numero: "02215",
    fechaInicio: "14/10/2026 10:05",
    ipressOrigen: "CENTRO DE SALUD JUAN PEREZ CARRANZA",
    upsOrigen: "MEDICINA GENERAL",
    estado: 1,
    estadoDescripcion: "REGISTRADO",
  },
  {
    codigo: "00006215",
    hospital: "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME",
    red: "LIMA CENTRO",
    ris: "RIS 6",
    distrito: "Cercado de Lima",
    especialidad: "Pediatría",
    codigoUps: "302301",
    dni: DEMO_PEDIATRIA_DNI,
    numero: "00731",
    fechaInicio: "25/09/2026 15:20",
    ipressOrigen: "CENTRO DE SALUD SAN MARTIN DE PORRES",
    upsOrigen: "PEDIATRIA",
    estado: 3,
    estadoDescripcion: "ACEPTADO",
  },
];

export const DEMO_DNIS: readonly string[] = [DEMO_REFERENCIA_DNI, DEMO_PEDIATRIA_DNI];

export function isDemoReferenciaDni(dni: string | null | undefined): boolean {
  return isString(dni) && DEMO_DNIS.includes(dni);
}

export function demoReferenciasForDni(dni: string): DemoReferencia[] {
  return DEMO_REFERENCIAS.filter((referencia) => referencia.dni === dni);
}

export function demoReferenciaItem(referencia: DemoReferencia): ReferenciaItem {
  return {
    idReferencia: referencia.codigo,
    numero: referencia.numero,
    fechaInicio: referencia.fechaInicio,
    ipressOrigen: referencia.ipressOrigen,
    ipressDestino: referencia.hospital,
    upsOrigen: referencia.upsOrigen,
    upsDestino: referencia.especialidad,
    codigoIpressDestino: referencia.codigo,
    codigoUpsDestino: referencia.codigoUps,
    estado: referencia.estado,
    estadoDescripcion: referencia.estadoDescripcion,
  };
}

export function demoListReferences(dni: string): ListReferencesResult | undefined {
  if (isRealMinsaEnabled() || !isDemoReferenciaDni(dni)) return undefined;
  return { statusReference: ReferenceStatus.FOUND, message: "", data: demoReferenciasForDni(dni).map(demoReferenciaItem) };
}

export const DEMO_HORA_INICIO = "08:00 am";
export const DEMO_HORA_FIN = "03:00 pm";

const DEMO_HORA_INICIO_24 = "08:00";
const DEMO_HORA_FIN_24 = "15:00";

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

function toHHMM(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function demoHoraSlots(): HoraSlot[] {
  const limite = toMinutes(DEMO_HORA_FIN_24);
  const slots: HoraSlot[] = [];
  for (let start = toMinutes(DEMO_HORA_INICIO_24); start + DEMO_TURNO_MINUTOS <= limite; start += DEMO_TURNO_MINUTOS) {
    slots.push({ start: toHHMM(start), end: toHHMM(start + DEMO_TURNO_MINUTOS), cupos: 1 });
  }
  return slots;
}
