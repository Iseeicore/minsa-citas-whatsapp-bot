export const DEMO_REFERENCIA_DNI = "10308523";

export type DemoReferencia = {
  codigo: string;
  hospital: string;
  red: string;
  ris: string;
  distrito: string;
};

export const DEMO_REFERENCIAS: DemoReferencia[] = [
  {
    codigo: "00006206",
    hospital: "HOSPITAL NACIONAL DOS DE MAYO",
    red: "LIMA CENTRO",
    ris: "RIS 4",
    distrito: "Cercado de Lima",
  },
  {
    codigo: "00006215",
    hospital: "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME",
    red: "LIMA CENTRO",
    ris: "RIS 6",
    distrito: "Cercado de Lima",
  },
  {
    codigo: "00033381",
    hospital: "Hospital de Lima Este - Vitarte (III-E)",
    red: "LIMA ESTE",
    ris: "RIS Ate",
    distrito: "Ate",
  },
  {
    codigo: "00005946",
    hospital: "Hospital Nacional Hipólito Unanue",
    red: "LIMA ESTE",
    ris: "RIS Santa Anita - El Agustino",
    distrito: "El Agustino",
  },
];

export const DEMO_ESPECIALIDAD = "Medicina General";
export const DEMO_HORA_INICIO = "08:00 am";
export const DEMO_HORA_FIN = "03:00 pm";
export const DEMO_TURNO_MINUTOS = 25;
export const DEMO_TURNO_ASIGNADO = "08:00 am - 08:25 am";
