// Driven port for the MINSA WhatsApp catalog + booking endpoints (Cita MVP,
// no-SDD fast path per explicit user decision). Mirrors minsa-identity-client.ts's
// shape: Bearer-token calls (token comes from slots.citaBearer, set by the
// OTP flow), one HTTP implementation (http-minsa-catalog-client.ts) plus one
// sandbox fake (fakes/sandbox-fakes.ts). Status literals are all unique
// across every FsmSystemEvent.result member (see conversation-fsm.ts) — never
// reuse "found"/"not_found"/"valid"/"verified"/etc.

export interface UbigeoOption {
  readonly ubigeoInei: string;
  readonly distrito: string;
  readonly provincia: string;
  readonly departamento: string;
}
export type SearchUbigeoResult =
  | { status: "ubigeo_found"; options: readonly UbigeoOption[] }
  | { status: "ubigeo_empty" };

export interface EspecialidadOption {
  readonly codigoEspecialidad: string;
  readonly nombreEspecialidad: string;
  readonly cantidadCupos: number;
}
export type ListEspecialidadesResult =
  | { status: "especialidades_found"; options: readonly EspecialidadOption[] }
  | { status: "especialidades_empty" };

export interface EstablecimientoOption {
  readonly renipressCode: string;
  readonly establishmentName: string;
  readonly quotasOnline: number;
}
export type ListEstablecimientosResult =
  | { status: "establecimientos_found"; options: readonly EstablecimientoOption[] }
  | { status: "establecimientos_empty" };

export interface FechaOption {
  readonly fechaCupo: string;
  readonly cantidadCupos: number;
}
export type ListFechasResult =
  | { status: "fechas_found"; options: readonly FechaOption[] }
  | { status: "fechas_empty" };

export interface HoraOption {
  readonly horaInicio: string;
  readonly horaFin: string;
  readonly cantidadCupos: number;
}
export type ListHorasResult =
  | { status: "horas_found"; options: readonly HoraOption[] }
  | { status: "horas_empty" };

export type BookAppointmentResult =
  | { status: "booked"; url: string; mensajeApi: string }
  | { status: "duplicate" }
  | { status: "booking_rejected"; motivo: string };

export interface MinsaCatalogClient {
  searchUbigeo(
    input: { departamento: string; provincia: string; distrito: string },
    token: string
  ): Promise<SearchUbigeoResult>;
  listEspecialidades(ubigeo: string, token: string): Promise<ListEspecialidadesResult>;
  listEstablecimientos(
    input: { ubigeo: string; especialidadId: string },
    token: string
  ): Promise<ListEstablecimientosResult>;
  listFechas(input: { codEess: string; especialidadId: string }, token: string): Promise<ListFechasResult>;
  listHoras(
    input: { codEess: string; especialidadId: string; fecha: string },
    token: string
  ): Promise<ListHorasResult>;
  bookAppointment(
    input: {
      codigoRenipress: string;
      codigoUps: string;
      fechaCita: string;
      horaCita: string;
      numeroDocumentoPaciente: string;
    },
    token: string
  ): Promise<BookAppointmentResult>;
}
