import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";

/** Ante un token del MINSA vencido (401) vuelve a pedir el documento sin perder los datos de la cita, y luego retoma el paso donde estaba. */
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
