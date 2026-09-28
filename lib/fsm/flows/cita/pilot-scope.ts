import { buildResult, cloneSession, sendCtaUrl } from "@/lib/fsm/core/handlers-shared";
import { normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";

const NATIONAL_REDIRECT_BUTTON_TEXT = "Cita Nivel Global";
const NATIONAL_REDIRECT_URL = "https://dminsadigital.minsa.gob.pe/login";

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
  next.state = "cita_national_redirect";
  return buildResult(next, [sendCtaUrl(nationalRedirectText(), NATIONAL_REDIRECT_BUTTON_TEXT, NATIONAL_REDIRECT_URL)]);
}
