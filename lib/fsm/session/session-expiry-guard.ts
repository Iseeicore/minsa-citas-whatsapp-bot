import type { HandleEvent, Session } from "@/lib/fsm/core/types";
import { SessionExpiryReason } from "@/lib/enums/session-expiry-reason";
import { SlotKey } from "@/lib/enums/slot-key";

export const SESSION_IDLE_TIMEOUT_MS = 600_000;
export const TOKEN_EXPIRY_MARGIN_MS = 30_000;

export type { SessionExpiryReason };

const RESUME_STATE_BY_WAITING_STATE: Readonly<Record<string, string | null>> = {
  cita_awaiting_distrito_ai: null,
  cita_awaiting_distrito_disambiguation: null,
  cita_awaiting_departamento: null,
  cita_awaiting_provincia: null,
  cita_awaiting_distrito: null,
  cita_awaiting_other_distrito: null,
  cita_awaiting_ubigeo_select: "cita_ubigeo_pending",
  cita_awaiting_especialidad_select: "cita_especialidad_pending",
  cita_awaiting_establecimiento_select: "cita_establecimiento_pending",
  cita_awaiting_fecha_select: "cita_fecha_pending",
  cita_awaiting_other_fecha: "cita_fecha_pending",
  cita_awaiting_hora_select: "cita_hora_pending",
  cita_awaiting_hora_confirm: "cita_hora_pending",
  cita_awaiting_hora_choice: "cita_hora_pending",
  cita_awaiting_duplicate_choice: "cita_especialidad_pending",
  cita_awaiting_other_establecimiento: "cita_establecimiento_pending",
};

export const AUTHENTICATED_WAITING_STATES: readonly string[] = Object.keys(RESUME_STATE_BY_WAITING_STATE);

const EXIT_CONFIRM_STATE = "cita_awaiting_exit_confirm";

function guardedStateOf(state: string, slots: Session["slots"]): string | undefined {
  if (state !== EXIT_CONFIRM_STATE) return state in RESUME_STATE_BY_WAITING_STATE ? state : undefined;
  const before = slots[SlotKey.CITA_EXIT_RESUME_STATE];
  return typeof before === "string" && before in RESUME_STATE_BY_WAITING_STATE ? before : undefined;
}

export function resumeStateFor(waitingState: string, slots: Session["slots"] = {}): string | undefined {
  const guarded = guardedStateOf(waitingState, slots);
  return guarded ? (RESUME_STATE_BY_WAITING_STATE[guarded] ?? undefined) : undefined;
}

export function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload !== "object" || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

export function detectSessionExpiry(
  session: Session,
  event: HandleEvent,
  now: number,
): SessionExpiryReason | null {
  if (event.type === "query_result") return null;
  if (!guardedStateOf(session.state, session.slots)) return null;

  const bearer = session.slots[SlotKey.CITA_BEARER];
  if (typeof bearer !== "string" || bearer === "") return null;

  if (session.updatedAt && now - session.updatedAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return SessionExpiryReason.IDLE;
  }

  const exp = decodeJwtExp(bearer);
  if (exp !== null && exp * 1000 - now < TOKEN_EXPIRY_MARGIN_MS) return SessionExpiryReason.TOKEN_EXPIRED;

  return null;
}
