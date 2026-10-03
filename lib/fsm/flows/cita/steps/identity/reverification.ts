import { buildResult, cloneSession, query, sendText } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { QueryKind } from "@/lib/enums/query-kind";
import { SlotKey } from "@/lib/enums/slot-key";

/** Ante un token del MINSA vencido (401) vuelve a pedir el documento sin perder los datos de la cita, y luego retoma el paso donde estaba. */
export function beginReverification(session: Session, resumeState: string): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.CITA_RESUME_STATE] = resumeState;
  delete next.slots[SlotKey.CITA_BEARER];
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
        query(QueryKind.SEARCH_UBIGEO, {
          departamento: String(next.slots[SlotKey.CITA_DEPARTAMENTO] ?? ""),
          provincia: String(next.slots[SlotKey.CITA_PROVINCIA] ?? ""),
          distrito: String(next.slots[SlotKey.CITA_DISTRITO] ?? ""),
        }),
      ]);

    case "cita_especialidad_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando especialidades disponibles…"),
        query(QueryKind.LIST_ESPECIALIDADES, { ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? "") }),
      ]);

    case "cita_establecimiento_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando establecimientos…"),
        query(QueryKind.LIST_ESTABLECIMIENTOS, {
          especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
          ubigeo: String(next.slots[SlotKey.CITA_UBIGEO] ?? ""),
        }),
      ]);

    case "cita_fecha_pending":
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando fechas disponibles…"),
        query(QueryKind.LIST_FECHAS, {
          codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
          especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
        }),
      ]);

    case "cita_hora_pending":
    default:
      return buildResult(next, [
        sendText("¡Listo! Continuemos con tu cita. Buscando horarios disponibles…"),
        query(QueryKind.LIST_HORAS, {
          codEess: String(next.slots[SlotKey.CITA_COD_EESS] ?? ""),
          especialidadId: String(next.slots[SlotKey.CITA_ESPECIALIDAD_ID] ?? ""),
          fecha: String(next.slots[SlotKey.CITA_FECHA] ?? ""),
        }),
      ]);
  }
}
