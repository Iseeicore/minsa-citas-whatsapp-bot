import { buildResult, sendList, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import type { BotService } from "@/lib/services/bot-service";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const INCIDENCIA_NOMBRE_BUTTONS = [
  { id: IncidenciaButtonId.CON_NOMBRE, title: "Sí, doy mi nombre" },
  { id: IncidenciaButtonId.ANONIMO, title: "Prefiero ser anónimo" },
];

export const buildMenuEffect = () => sendList("¿En qué podemos ayudarte hoy?", serviceCatalog.menuRows());

/** Respuesta a quien pide un servicio deshabilitado (o estaba dentro de su flujo): el aviso y el menú, sin iniciar nada. */
export function disabledServiceReply(service: BotService, slots: Session["slots"] = {}): HandlerResult {
  return withNote(
    buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [sendText(service.disabledReply()), buildMenuEffect()]),
    { kind: "shortcut", detail: { name: "service_disabled", service: service.id } },
  );
}

export function beginCita(slots: Session["slots"], hints: CitaHints, intro: string): HandlerResult {
  const next: Session = {
    state: SessionState.CITA_AWAITING_DNI,
    slots: {
      ...slots,
      ...(hints.especialidad ? { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: hints.especialidad } : {}),
      ...(hints.distrito ? { [SlotKey.CITA_DISTRITO_HINT_TEXT]: hints.distrito } : {}),
    },
    counters: {},
  };
  return buildResult(next, [sendText(intro)]);
}
