import { signMinsaRequest } from "./minsa-signature";

// ---- Result shapes returned to lib/fsm/executor.ts --------------------
// These are internal-only shapes (not wire formats); the executor folds
// them into a synthetic query-result event that lib/fsm/handlers*.ts reads.

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

// ---- Fake catalog (used when SANDBOX_USE_REAL_MINSA !== "true") -------

const FAKE_DNI = "12345678";
const FAKE_TWOFA_ID = "fake-twofa-12345678";
const FAKE_OTP = "1234";
const FAKE_BEARER = "fake-bearer-token";

const FAKE_UBIGEO: UbigeoItem = {
  ubigeoInei: "150118",
  distrito: "LURIGANCHO",
  provincia: "LIMA",
  departamento: "LIMA",
};

const FAKE_ESPECIALIDADES: EspecialidadItem[] = [
  { codigoEspecialidad: "01", nombreEspecialidad: "MEDICINA GENERAL", cantidadCupos: 5 },
  { codigoEspecialidad: "02", nombreEspecialidad: "ODONTOLOGIA", cantidadCupos: 3 },
];

const FAKE_ESTABLECIMIENTOS: EstablecimientoItem[] = [
  { renipressCode: "0000123", establishmentName: "CENTRO DE SALUD LURIGANCHO", quotasOnline: 10 },
];

// Tomorrow and the day after, in LIMA's calendar (the citizen's, not the
// server's), so the fake dates never go stale and never land on "today" (which
// would hide morning slots that already started).
function fakeFechas(): FechaItem[] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  const ymd = (daysAhead: number) => {
    const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + daysAhead));
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  };

  return [
    { fechaCupo: ymd(1), cantidadCupos: 5 },
    { fechaCupo: ymd(2), cantidadCupos: 3 },
  ];
}

// Chosen so every typed-time case can be tried by hand:
//  "1" -> position 1 (08:00) or 1 PM (13:00): two-button question;
//  "8" -> no option 8, the only 8 o'clock slot is 08:00;  "3" -> position 3 = 13:00;
//  "9" -> 09:30;  "en la tarde" -> only 13:00;  "a la 1" / "1 pm" -> 13:00.
const FAKE_HORAS: HoraItem[] = [
  { horaInicio: "08:00", horaFin: "08:30", cantidadCupos: 2 },
  { horaInicio: "09:30", horaFin: "10:00", cantidadCupos: 1 },
  { horaInicio: "13:00", horaFin: "13:30", cantidadCupos: 2 },
];

// ---- Wire helpers -------------------------------------------------------

function minsaHost(): string {
  return process.env.MINSA_API_HOST ?? "";
}

async function postSigned(path: string, body: Record<string, unknown>): Promise<Response> {
  const bodyJson = JSON.stringify(body);
  const signedHeaders = signMinsaRequest(bodyJson);

  return fetch(`${minsaHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signedHeaders,
    },
    body: bodyJson,
  });
}

// The catalog endpoints run behind MINSA's own web app; they expect
// browser-shaped headers rather than the HMAC signature used for identity.
async function postWithBearer(
  path: string,
  body: Record<string, unknown>,
  bearer: string,
): Promise<Response> {
  return fetch(`${minsaHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Origin: "https://dminsadigital.minsa.gob.pe",
      Referer: "https://dminsadigital.minsa.gob.pe/",
    },
    body: JSON.stringify(body),
  });
}

function todayYYYYMMDD(): string {
  return formatYYYYMMDD(new Date());
}

function endOfMonthYYYYMMDD(): string {
  const now = new Date();
  return formatYYYYMMDD(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function formatYYYYMMDD(date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
}

// "08:45" -> "845" — the booking endpoint drops the colon and any leading
// zero on the hour, but keeps a leading zero on the minutes.
export function formatHoraCita(horaInicio: string): string {
  const [hh, mm] = horaInicio.split(":");
  return `${parseInt(hh, 10)}${mm}`;
}

// MINSA's real quotas/dates endpoint returns fecha_cupo as "DD/MM/YYYY"
// (shown to the citizen as-is, e.g. in a list row) but quotas/times and
// appointments require "YYYYMMDD". Idempotent for values already in
// YYYYMMDD (e.g. Sandbox's fakeFechas(), which has no slashes) — those pass
// through unchanged.
export function formatFechaForApi(fechaCupo: string): string {
  const [day, month, year] = fechaCupo.split("/");
  if (!day || !month || !year) return fechaCupo;
  return `${year}${month}${day}`;
}

// ---- Identity ------------------------------------------------------------

export async function validateUser(dni: string): Promise<ValidateUserResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postSigned("/api/v1/whatsapp/validate-user", {
      numero_documento: dni,
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
    });

    if ([400, 404, 422].includes(response.status)) {
      return { status: "not_valid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const body = await response.json();
    const valid =
      body?.valido === true ||
      body?.success === true ||
      body?.data?.valido === true ||
      body?.is_valid === true;

    if (!valid) return { status: "not_valid" };

    const twofaId = body?.twofa_id ?? body?.data?.twofa_id;
    if (typeof twofaId !== "string") return { status: "error" };

    return { status: "valid", twofaId };
  }

  if (dni === FAKE_DNI) {
    return { status: "valid", twofaId: FAKE_TWOFA_ID };
  }
  return { status: "not_valid" };
}

export async function verifyCode(twofaId: string, code: string): Promise<VerifyCodeResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postSigned("/api/v1/whatsapp/verify-code", {
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
      twofa_id: twofaId,
      code,
    });

    if ([400, 401, 422].includes(response.status)) {
      return { status: "invalid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const body = await response.json();
    const token = body?.token ?? body?.data?.token;

    if (body?.success === true && typeof token === "string") {
      return { status: "verified", token };
    }
    return { status: "invalid" };
  }

  if (twofaId === FAKE_TWOFA_ID && code === FAKE_OTP) {
    return { status: "verified", token: FAKE_BEARER };
  }
  return { status: "invalid" };
}

// ---- Catalog / booking (bearer = citaBearer from verifyCode) -------------

export async function searchUbigeo(
  departamento: string,
  provincia: string,
  distrito: string,
  bearer: string,
): Promise<SearchUbigeoResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/api/v1/whatsapp/ubigeo",
      { departamento, provincia, distrito, limite: 5 },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: UbigeoItem[] = (body?.data ?? []).map((row: Record<string, unknown>) => ({
      ubigeoInei: String(row.ubigeo_inei),
      distrito: String(row.distrito),
      provincia: String(row.provincia),
      departamento: String(row.departamento),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  const matches = distrito.trim().toUpperCase() === FAKE_UBIGEO.distrito;
  return matches ? { status: "found", items: [FAKE_UBIGEO] } : { status: "empty" };
}

export async function listEspecialidades(
  ubigeo: string,
  bearer: string,
): Promise<ListEspecialidadesResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/specialties-quotas",
      { ubigeo, fecha_inicio: todayYYYYMMDD(), fecha_fin: endOfMonthYYYYMMDD() },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: EspecialidadItem[] = (body?.data?.especialidades ?? []).map(
      (row: Record<string, unknown>) => ({
        codigoEspecialidad: String(row.codigo_especialidad),
        nombreEspecialidad: String(row.nombre_especialidad),
        cantidadCupos: Number(row.cantidad_cupos),
      }),
    );

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: FAKE_ESPECIALIDADES };
}

export async function listEstablecimientos(
  especialidadId: string,
  ubigeo: string,
  bearer: string,
): Promise<ListEstablecimientosResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/establishments",
      { especialidad_id: especialidadId, ubigeo, page: 1, page_size: 10 },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: EstablecimientoItem[] = (body?.data?.items ?? []).map(
      (row: Record<string, unknown>) => ({
        renipressCode: String(row.renipress_code),
        establishmentName: String(row.establishment_name),
        quotasOnline: Number(row.quotas_online),
      }),
    );

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: FAKE_ESTABLECIMIENTOS };
}

export async function listFechas(
  codEess: string,
  especialidadId: string,
  bearer: string,
): Promise<ListFechasResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/quotas/dates",
      { cod_eess: codEess, especialidad_id: especialidadId },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: FechaItem[] = (body?.data?.fechas ?? []).map((row: Record<string, unknown>) => ({
      fechaCupo: String(row.fecha_cupo),
      cantidadCupos: Number(row.cantidad_cupos),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: fakeFechas() };
}

export async function listHoras(
  codEess: string,
  especialidadId: string,
  fecha: string,
  bearer: string,
): Promise<ListHorasResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/quotas/times",
      { cod_eess: codEess, especialidad_id: especialidadId, fecha },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const items: HoraItem[] = (body?.data?.horarios ?? []).map((row: Record<string, unknown>) => ({
      horaInicio: String(row.hora_inicio),
      horaFin: String(row.hora_fin),
      cantidadCupos: Number(row.cantidad_cupos),
    }));

    return items.length === 0 ? { status: "empty" } : { status: "found", items };
  }

  return { status: "found", items: FAKE_HORAS };
}

export async function bookAppointment(
  params: BookAppointmentParams,
  bearer: string,
): Promise<BookAppointmentResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postWithBearer(
      "/whatsapp/api/v1/appointments",
      {
        codigo_renipress: params.codigoRenipress,
        codigo_ups: params.codigoUps,
        fecha_cita: params.fechaCita,
        hora_cita: params.horaCita,
        numero_documento_paciente: params.numeroDocumentoPaciente,
      },
      bearer,
    );
    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "error" };

    const body = await response.json();
    const message: string = body?.message ?? "";

    if (/ya tiene una cita activa/i.test(message)) {
      return { status: "duplicate", message };
    }
    if (body?.data?.url) {
      return { status: "booked", url: body.data.url, message };
    }
    return { status: "rejected", message };
  }

  return {
    status: "booked",
    url: "https://dminsadigital.minsa.gob.pe/citas/confirmacion/FAKE123",
    message: "Cita registrada correctamente",
  };
}
