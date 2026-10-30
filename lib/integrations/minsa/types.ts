import type { BookingStatus } from "@/lib/enums/booking-status";
import type { ReferenceStatus } from "@/lib/enums/reference-status";
import type { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import type { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import type { CatalogStatus } from "@/lib/enums/catalog-status";

export type ValidateUserResult =
  { status: ValidateUserStatus.VALID; twofaId: string } | { status: ValidateUserStatus.NOT_VALID } | { status: ValidateUserStatus.ERROR };

export type VerifyCodeResult =
  { status: VerifyCodeStatus.VERIFIED; token: string } | { status: VerifyCodeStatus.INVALID } | { status: VerifyCodeStatus.ERROR };

export type UbigeoItem = {
  ubigeoInei: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

export type SearchUbigeoResult =
  | { status: CatalogStatus.FOUND; items: UbigeoItem[] }
  | { status: CatalogStatus.EMPTY }
  | { status: CatalogStatus.ERROR }
  | { status: CatalogStatus.UNAUTHORIZED };

export type EspecialidadItem = {
  codigoEspecialidad: string;
  nombreEspecialidad: string;
  cantidadCupos: number;
};

export type ListEspecialidadesResult =
  | { status: CatalogStatus.FOUND; items: EspecialidadItem[] }
  | { status: CatalogStatus.EMPTY }
  | { status: CatalogStatus.ERROR }
  | { status: CatalogStatus.UNAUTHORIZED };

export type EstablecimientoItem = {
  renipressCode: string;
  establishmentName: string;
  quotasOnline: number;
};

export type ListEstablecimientosResult =
  | { status: CatalogStatus.FOUND; items: EstablecimientoItem[]; page?: number; totalPages?: number }
  | { status: CatalogStatus.EMPTY }
  | { status: CatalogStatus.ERROR }
  | { status: CatalogStatus.UNAUTHORIZED };

export type FechaItem = {
  fechaCupo: string;
  cantidadCupos: number;
};

export type ListFechasResult =
  | { status: CatalogStatus.FOUND; items: FechaItem[] }
  | { status: CatalogStatus.EMPTY }
  | { status: CatalogStatus.ERROR }
  | { status: CatalogStatus.UNAUTHORIZED };

export type HoraItem = {
  horaInicio: string;
  horaFin: string;
  cantidadCupos: number;
};

export type ListHorasResult =
  | { status: CatalogStatus.FOUND; items: HoraItem[] }
  | { status: CatalogStatus.EMPTY }
  | { status: CatalogStatus.ERROR }
  | { status: CatalogStatus.UNAUTHORIZED };

export type BookAppointmentParams = {
  codigoRenipress: string;
  codigoUps: string;
  fechaCita: string;
  horaCita: string;
  numeroDocumentoPaciente: string;
  referenciaId?: string;
};

export type BookAppointmentResult =
  | { status: BookingStatus.BOOKED; url: string; message?: string }
  | { status: BookingStatus.DUPLICATE; message: string }
  | { status: BookingStatus.REJECTED; message?: string }
  | { status: BookingStatus.ERROR }
  | { status: BookingStatus.UNAVAILABLE }
  | { status: BookingStatus.UNAUTHORIZED };

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
  estado: number;
  estadoDescripcion?: string;
};

export type ListReferencesResult = {
  statusReference: ReferenceStatus;
  message: string;
  data: ReferenciaItem[];
};
