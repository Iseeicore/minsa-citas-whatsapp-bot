import { buildResult, sendButtons, sendList, sendText } from "@/lib/fsm/core/handlers-shared";
import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";
import { ReclamoButtonId } from "@/lib/enums/reclamo-button-id";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

export const MENU_ROWS = [
  { id: MenuChoice.AGENDAR_CITA, title: "Agendar una cita médica" },
  { id: MenuChoice.REGISTRAR_RECLAMO, title: "Registrar un reclamo" },
];

export const RECLAMO_NOMBRE_BUTTONS = [
  { id: ReclamoButtonId.CON_NOMBRE, title: "Sí, doy mi nombre" },
  { id: ReclamoButtonId.ANONIMO, title: "Prefiero ser anónimo" },
];

export const buildMenuEffect = () => sendList("¿En qué podemos ayudarte hoy?", MENU_ROWS);

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

export function beginReclamo(slots: Session["slots"], intro: string): HandlerResult {
  const next: Session = { state: SessionState.RECLAMO_IDENTITY_CHOICE, slots: { ...slots }, counters: {} };
  return buildResult(next, [sendButtons(intro, RECLAMO_NOMBRE_BUTTONS)]);
}
