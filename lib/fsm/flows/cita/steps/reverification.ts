import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";

// ---- Token-expiry recovery ------------------------------------------------
// MINSA's bearer token only lasts about 30 minutes. If a citizen pauses
// mid-flow (deciding on a specialty, a date, etc.) and comes back later, the
// next catalog/booking call fails with a 401 — surfaced as
// result.status === "unauthorized" by lib/integrations/minsa.ts. Treating that like
// any other API error would end the whole booking and discard everything
// already chosen (district, especialidad, establecimiento…). Instead, this
// asks the citizen to verify again WITHOUT losing that progress, then
// resumes exactly at the step that failed once they do.

export function beginReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.slots.citaResumeState = resumeState;
  delete next.slots.citaBearer;
  next.state = "cita_awaiting_dni";
  return buildResult(next, [
    sendText(
      "Tu verificación anterior expiró por inactividad. No te preocupes, no perdimos los datos de tu cita — ingresa tu número de documento (8 dígitos) para continuar justo donde quedaste.",
    ),
  ]);
}

// Re-fires the exact query the citizen was waiting on when their token
// expired, using whatever's already stored in slots — never re-asks a
// question they already answered. book_appointment resumes one step
// earlier (re-listing horarios) instead of resubmitting a possibly-stale
// hora selection, since real time passed and that slot might be gone.
export function resumeAfterReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.state = resumeState;

  switch (resumeState) {
    case "cita_ubigeo_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando tu ubigeo…"),
        query("search_ubigeo", {
          departamento: String(next.slots.citaDepartamento ?? ""),
          provincia: String(next.slots.citaProvincia ?? ""),
          distrito: String(next.slots.citaDistrito ?? ""),
        }),
      ]);

    case "cita_especialidad_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando especialidades disponibles…"),
        query("list_especialidades", { ubigeo: String(next.slots.citaUbigeo ?? "") }),
      ]);

    case "cita_establecimiento_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando establecimientos…"),
        query("list_establecimientos", {
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
          ubigeo: String(next.slots.citaUbigeo ?? ""),
        }),
      ]);

    case "cita_fecha_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando fechas disponibles…"),
        query("list_fechas", {
          codEess: String(next.slots.citaCodEess ?? ""),
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
        }),
      ]);

    case "cita_hora_pending":
    default:
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando horarios disponibles…"),
        query("list_horas", {
          codEess: String(next.slots.citaCodEess ?? ""),
          especialidadId: String(next.slots.citaEspecialidadId ?? ""),
          fecha: String(next.slots.citaFecha ?? ""),
        }),
      ]);
  }
}
