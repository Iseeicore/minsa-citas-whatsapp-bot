import type { HandleEvent, Session } from "@/lib/fsm/core/types";
import { SessionExpiryReason } from "@/lib/enums/session-expiry-reason";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { BASE64URL_MINUS, BASE64URL_UNDERSCORE } from "@/lib/constants/regex/integrations";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { isString, isFiniteNumber, isRecord } from "@/lib/utils/type-guards";
import { JwtExpiryStatus } from "@/lib/enums/jwt-expiry-status";
import { logger } from "@/lib/observability/logger";

export const SESSION_IDLE_TIMEOUT_MS = 600_000;
export const TOKEN_EXPIRY_MARGIN_MS = 30_000;

export type { SessionExpiryReason };

const RESUME_STATE_BY_WAITING_STATE: Readonly<Record<string, string | null>> = {
  [SessionState.CITA_AWAITING_DISTRITO_AI]: null,
  [SessionState.CITA_AWAITING_DISTRITO_DISAMBIGUATION]: null,
  [SessionState.CITA_AWAITING_DEPARTAMENTO]: null,
  [SessionState.CITA_AWAITING_PROVINCIA]: null,
  [SessionState.CITA_AWAITING_DISTRITO]: null,
  [SessionState.CITA_AWAITING_OTHER_DISTRITO]: null,
  [SessionState.CITA_AWAITING_UBIGEO_SELECT]: SessionState.CITA_UBIGEO_PENDING,
  [SessionState.CITA_AWAITING_ESPECIALIDAD_SELECT]: SessionState.CITA_ESPECIALIDAD_PENDING,
  [SessionState.CITA_AWAITING_ESTABLECIMIENTO_SELECT]: SessionState.CITA_ESTABLECIMIENTO_PENDING,
  [SessionState.CITA_AWAITING_ESTABLECIMIENTO_CONFIRM]: SessionState.CITA_ESTABLECIMIENTO_PENDING,
  [SessionState.CITA_AWAITING_FECHA_SELECT]: SessionState.CITA_FECHA_PENDING,
  [SessionState.CITA_AWAITING_OTHER_FECHA]: SessionState.CITA_FECHA_PENDING,
  [SessionState.CITA_AWAITING_HORA_SELECT]: SessionState.CITA_HORA_PENDING,
  [SessionState.CITA_AWAITING_HORA_CONFIRM]: SessionState.CITA_HORA_PENDING,
  [SessionState.CITA_AWAITING_HORA_CHOICE]: SessionState.CITA_HORA_PENDING,
  [SessionState.CITA_AWAITING_DUPLICATE_CHOICE]: SessionState.CITA_ESPECIALIDAD_PENDING,
  [SessionState.CITA_AWAITING_OTHER_ESTABLECIMIENTO]: SessionState.CITA_ESTABLECIMIENTO_PENDING,
  [SessionState.CITA_AWAITING_REFERENCIA_SELECT]: null,
  [SessionState.CITA_AWAITING_REFERENCIA_CONFIRM]: null,
  [SessionState.REFERENCIA_AWAITING_CITA_OFFER]: null,
  [SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE]: SessionState.REFERENCIA_AWAITING_OTHER_REFERENCE,
};

export const AUTHENTICATED_WAITING_STATES: readonly string[] = Object.keys(RESUME_STATE_BY_WAITING_STATE);

function guardedStateOf(state: string, slots: Session["slots"]): string | undefined {
  if (state !== SessionState.CITA_AWAITING_EXIT_CONFIRM) return state in RESUME_STATE_BY_WAITING_STATE ? state : undefined;
  const before = slots[SlotKey.CITA_EXIT_RESUME_STATE];
  return isString(before) && before in RESUME_STATE_BY_WAITING_STATE ? before : undefined;
}

export function resumeStateFor(waitingState: string, slots: Session["slots"] = {}): string | undefined {
  const guarded = guardedStateOf(waitingState, slots);
  return guarded ? (RESUME_STATE_BY_WAITING_STATE[guarded] ?? undefined) : undefined;
}

export type JwtExpiry =
  { status: JwtExpiryStatus.FOUND; exp: number } | { status: JwtExpiryStatus.ABSENT } | { status: JwtExpiryStatus.MALFORMED };

const MALFORMED: JwtExpiry = { status: JwtExpiryStatus.MALFORMED };

export function decodeJwtExp(token: string): JwtExpiry {
  const parts = token.split(".");
  if (parts.length !== 3) return MALFORMED;

  const base64 = parts[1].replace(BASE64URL_MINUS, "+").replace(BASE64URL_UNDERSCORE, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let payload: unknown;
  try {
    payload = JSON.parse(atob(padded));
  } catch {
    return MALFORMED;
  }
  if (!isRecord(payload)) return MALFORMED;
  if (payload.exp === undefined) return { status: JwtExpiryStatus.ABSENT };
  return isFiniteNumber(payload.exp) ? { status: JwtExpiryStatus.FOUND, exp: payload.exp } : MALFORMED;
}

export function detectSessionExpiry(session: Session, event: HandleEvent, now: number): SessionExpiryReason | null {
  if (event.type === InternalEventType.QUERY_RESULT) return null;
  if (!guardedStateOf(session.state, session.slots)) return null;

  const bearer = session.slots[SlotKey.CITA_BEARER];
  if (!isString(bearer) || bearer === "") return null;

  if (session.updatedAt && now - session.updatedAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return SessionExpiryReason.IDLE;
  }

  const expiry = decodeJwtExp(bearer);
  if (expiry.status === JwtExpiryStatus.MALFORMED) {
    logger.warn("session.token_unreadable", { state: session.state });
    return null;
  }
  if (expiry.status === JwtExpiryStatus.FOUND && expiry.exp * 1000 - now < TOKEN_EXPIRY_MARGIN_MS) return SessionExpiryReason.TOKEN_EXPIRED;

  return null;
}

const INCIDENCIA_RESUMABLE_STATES: ReadonlySet<string> = new Set<string>([
  SessionState.INCIDENCIA_AWAITING_UBICACION,
  SessionState.INCIDENCIA_CONFIRM_UBICACION,
  SessionState.INCIDENCIA_CONFIRM_OMITIR,
  SessionState.INCIDENCIA_IDENTITY_CHOICE,
  SessionState.INCIDENCIA_AWAITING_DNI,
  SessionState.INCIDENCIA_CONSENT_CHOICE,
  SessionState.INCIDENCIA_CONFIRM_BORRADOR,
  SessionState.INCIDENCIA_AWAITING_DESCRIPCION,
  SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA,
  SessionState.INCIDENCIA_AWAITING_FOTO,
  SessionState.INCIDENCIA_CONFIRM_REGISTRO,
]);

export function detectIncidenciaExpiry(session: Session, event: HandleEvent, now: number): SessionExpiryReason | null {
  if (event.type === InternalEventType.QUERY_RESULT) return null;
  if (!INCIDENCIA_RESUMABLE_STATES.has(session.state)) return null;
  if (session.updatedAt && now - session.updatedAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return SessionExpiryReason.IDLE;
  }
  return null;
}
