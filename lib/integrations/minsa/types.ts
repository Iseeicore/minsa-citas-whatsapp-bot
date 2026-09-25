// ---- Result shapes returned to lib/fsm/core/executor.ts --------------------
// These are internal-only shapes (not wire formats); the executor folds
// them into a synthetic query-result event that the lib/fsm handlers read.

export type ValidateUserResult =
  | { status: "valid"; twofaId: string }
  | { status: "not_valid" }
  | { status: "error" };

export type VerifyCodeResult =
  | { status: "verified"; token: string }
  | { status: "invalid" }
  | { status: "error" };

export type UbigeoItem = {
  ubigeoInei: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

export type SearchUbigeoResult =
  | { status: "found"; items: UbigeoItem[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

export type EspecialidadItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

export type ListEspecialidadesResult =
  | { status: "found"; items: EspecialidadItem[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

export type EstablecimientoItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

export type ListEstablecimientosResult =
  | { status: "found"; items: EstablecimientoItem[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

export type FechaItem = {
  fechaCupo: string;
  cantidadCupos: number;
};

export type ListFechasResult =
  | { status: "found"; items: FechaItem[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

export type HoraItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

export type ListHorasResult =
  | { status: "found"; items: HoraItem[] }
  | { status: "empty" }
  | { status: "error" }
  | { status: "unauthorized" };

export type BookAppointmentParams = {
  codigoRenipress: string;
  codigoUps: string;
  fechaCita: string; // YYYYMMDD
  horaCita: string; // already transformed (no colon, no leading zero on the hour)
  numeroDocumentoPaciente: string;
};

export type BookAppointmentResult =
  | { status: "booked"; url: string; message: string }
  | { status: "duplicate"; message: string }
  | { status: "rejected"; message: string }
  | { status: "error" }
  | { status: "unauthorized" };
