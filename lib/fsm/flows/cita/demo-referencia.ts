export const DEMO_REFERENCIA_DNI = "32028036";
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
export const DEMO_TURNO_ASIGNADO = "08:00 am - 08:25 am";
