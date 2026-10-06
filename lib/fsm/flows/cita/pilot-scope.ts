import { buildResult, cloneSession } from "@/lib/fsm/core/handlers-shared";
import { sendMinsaDigitalCta } from "@/lib/fsm/core/minsa-digital-cta";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { MINSA_DIGITAL_LOGIN_PATH } from "@/lib/integrations/minsa/wire";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { SessionState } from "@/lib/enums/session-state";

const NATIONAL_REDIRECT_BUTTON_TEXT = "Cita Nivel Global";

/** Alcance del piloto: CITA_ALLOWED_DEPARTAMENTOS, separados por comas; vacía o sin definir desactiva el filtro (todo el Perú). */
export function allowedDepartamentos(): string[] {
  return (process.env.CITA_ALLOWED_DEPARTAMENTOS ?? "")
    .split(",")
    .map((departamento) => normalizeText(departamento))
    .filter(Boolean);
}

export function isAllowedDepartamento(departamento: string): boolean {
  const allowed = allowedDepartamentos();
  return allowed.length === 0 || allowed.includes(normalizeText(departamento));
}

function joinPlaces(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function nationalRedirectText(): string {
  const places = joinPlaces(allowedDepartamentos().map(toDisplayPlace));
  return `Por el momento el agendamiento automático por este canal solo está disponible en ${places}. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.`;
}

export function redirectToNationalSite(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.CITA_NATIONAL_REDIRECT;
  return buildResult(next, [
    sendMinsaDigitalCta(nationalRedirectText(), NATIONAL_REDIRECT_BUTTON_TEXT, MINSA_DIGITAL_LOGIN_PATH),
  ]);
}
