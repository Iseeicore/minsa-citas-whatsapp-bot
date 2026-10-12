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
  | { status: "found"; items: EstablecimientoItem[]; page?: number; totalPages?: number }
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
  fechaCita: string;
  horaCita: string;
  numeroDocumentoPaciente: string;
  referenciaId?: string;
};

export type BookAppointmentResult =
  | { status: "booked"; url: string; message: string }
  | { status: "duplicate"; message: string }
  | { status: "rejected"; message: string }
  | { status: "error" }
  | { status: "unauthorized" };

/** Solo 3/5/7 llegan hasta acá: el filtro de estado ya se aplicó en listReferences. */
export type ReferenciaItem = {
  idReferencia: string;
  numero: string;
  fechaInicio: string;
  ipressOrigen: string;
  ipressDestino: string;
  upsOrigen: string;
  upsDestino: string;
  codigoIpressDestino: string;
  codigoUpsDestino: string;
  estado: 3 | 5 | 7;
};

/** `items` siempre es un arreglo: con elementos solo en `found`, vacío en `empty` y `error`. `message` es el del backend, si lo envió. */
export type ListReferencesResult = {
  status: "found" | "empty" | "error";
  items: ReferenciaItem[];
  message?: string;
};
