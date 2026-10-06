import type { HoraSlot } from "@/lib/fsm/parsing/date/time-parser";

export const DEMO_REFERENCIA_DNI = "10308523";
export const DEMO_PEDIATRIA_DNI = "47391441";

export type DemoReferencia = {
  codigo: string;
  hospital: string;
  red: string;
  ris: string;
  distrito: string;
  especialidad: string;
  dni: string;
};

export const DEMO_REFERENCIAS: DemoReferencia[] = [
  {
    codigo: "00006206",
    hospital: "HOSPITAL NACIONAL DOS DE MAYO",
    red: "LIMA CENTRO",
    ris: "RIS 4",
    distrito: "Cercado de Lima",
    especialidad: "Odontología",
    dni: DEMO_REFERENCIA_DNI,
  },
  {
    codigo: "00033381",
    hospital: "Hospital de Lima Este - Vitarte (III-E)",
    red: "LIMA ESTE",
    ris: "RIS Ate",
    distrito: "Ate",
    especialidad: "Cardiología",
    dni: DEMO_REFERENCIA_DNI,
  },
  {
    codigo: "00005946",
    hospital: "Hospital Nacional Hipólito Unanue",
    red: "LIMA ESTE",
    ris: "RIS Santa Anita - El Agustino",
    distrito: "El Agustino",
    especialidad: "Consulta Externa",
    dni: DEMO_REFERENCIA_DNI,
  },
  {
    codigo: "00006215",
    hospital: "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME",
    red: "LIMA CENTRO",
    ris: "RIS 6",
    distrito: "Cercado de Lima",
    especialidad: "Pediatría",
    dni: DEMO_PEDIATRIA_DNI,
  },
];

export const DEMO_DNIS: readonly string[] = [DEMO_REFERENCIA_DNI, DEMO_PEDIATRIA_DNI];

export function isDemoReferenciaDni(dni: string | null | undefined): boolean {
  return typeof dni === "string" && DEMO_DNIS.includes(dni);
}

export function demoReferenciasForDni(dni: string): DemoReferencia[] {
  return DEMO_REFERENCIAS.filter((referencia) => referencia.dni === dni);
}

export const DEMO_HORA_INICIO = "08:00 am";
export const DEMO_HORA_FIN = "03:00 pm";
export const DEMO_TURNO_MINUTOS = 25;

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

/** Genera los turnos de 25 min entre 8:00 am y 3:00 pm; es pura para poder probarla sin fijar la lista a mano. */
export function demoHoraSlots(): HoraSlot[] {
  const limite = toMinutes(DEMO_HORA_FIN_24);
  const slots: HoraSlot[] = [];
  for (let start = toMinutes(DEMO_HORA_INICIO_24); start + DEMO_TURNO_MINUTOS <= limite; start += DEMO_TURNO_MINUTOS) {
    slots.push({ start: toHHMM(start), end: toHHMM(start + DEMO_TURNO_MINUTOS), cupos: 1 });
  }
  return slots;
}
