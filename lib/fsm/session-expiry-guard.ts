import type { HandleEvent, Session } from "./types";

// A citizen who verified with an OTP holds a MINSA bearer (slots.citaBearer).
// Two independent reasons to stop trusting it before MINSA has to say 401:
//  - idle: nobody has written on this conversation for a while, so whoever
//    writes next may not be the citizen who verified;
//  - token: the bearer is a JWT that is already expired (or about to be).
// lib/fsm/handlers-cita.ts keeps the reactive 401 recovery as the safety net.

export const SESSION_IDLE_TIMEOUT_MS = 600_000;
export const TOKEN_EXPIRY_MARGIN_MS = 30_000;

export type SessionExpiryReason = "idle" | "token_expired";

// Every state that waits for the citizen's next message once a bearer exists,
// and the state the flow resumes at after they verify again. `null` means
// there is nothing to resume: the district is still being gathered, so the
// normal post-OTP prompt is the right place to land.
// Pending states (`*_pending`) are deliberately absent: they only ever run
// mid-turn, on synthetic query results, and must never be cut in half.
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
  cita_awaiting_hora_select: "cita_hora_pending",
  cita_awaiting_hora_confirm: "cita_hora_pending",
  cita_awaiting_hora_choice: "cita_hora_pending",
};

export const AUTHENTICATED_WAITING_STATES: readonly string[] = Object.keys(RESUME_STATE_BY_WAITING_STATE);

export function resumeStateFor(waitingState: string): string | undefined {
  return RESUME_STATE_BY_WAITING_STATE[waitingState] ?? undefined;
}

// Best effort: MINSA's bearer is treated as opaque everywhere else, so
// anything that is not a decodable JWT with a numeric `exp` is simply ignored
// rather than guessed at. Signature is NOT verified — this only decides when
// to stop using a token, never whether to trust it.
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

// Pure: `now` is injected. Only judges a citizen's own message — the synthetic
// query results of a turn already in progress are never interrupted.
export function detectSessionExpiry(
  session: Session,
  event: HandleEvent,
  now: number,
): SessionExpiryReason | null {
  if (event.type === "query_result") return null;
  if (!(session.state in RESUME_STATE_BY_WAITING_STATE)) return null;

  const bearer = session.slots.citaBearer;
  if (typeof bearer !== "string" || bearer === "") return null;

  if (session.updatedAt && now - session.updatedAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return "idle";
  }

  const exp = decodeJwtExp(bearer);
  if (exp !== null && exp * 1000 - now < TOKEN_EXPIRY_MARGIN_MS) return "token_expired";

  return null;
}
