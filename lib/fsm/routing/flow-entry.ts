import { buildResult, sendButtons, sendList, sendText } from "@/lib/fsm/core/handlers-shared";
import type { CitaHints } from "@/lib/fsm/flows/cita/cita-hints";
import type { HandlerResult, Session } from "@/lib/fsm/core/types";

// The ways into each flow that more than one place needs: the main menu, the
// lexical guard's routing, and a new conversation whose first words already say
// what the citizen wants (see first-contact.ts).

export const MENU_ROWS = [
  { id: "agendar_cita", title: "Agendar una cita médica" },
  { id: "registrar_reclamo", title: "Registrar un reclamo" },
];

export const RECLAMO_IDENTITY_BUTTONS = [
  { id: "reclamo_con_dni", title: "Sí, tengo documento" },
  { id: "reclamo_sin_dni", title: "No tengo documento" },
];

export const buildMenuEffect = () => sendList("¿En qué podemos ayudarte hoy?", MENU_ROWS);

// The specialty and district the citizen named seed the hints the Cita flow
// applies on its own, and the next thing asked is the DNI.
export function beginCita(slots: Session["slots"], hints: CitaHints, intro: string): HandlerResult {
  const next: Session = {
    state: "cita_awaiting_dni",
    slots: {
      ...slots,
      ...(hints.especialidad ? { citaEspecialidadHintText: hints.especialidad } : {}),
      ...(hints.distrito ? { citaDistritoHintText: hints.distrito } : {}),
    },
    counters: {},
  };
  return buildResult(next, [sendText(intro)]);
}

export function beginReclamo(slots: Session["slots"], intro: string): HandlerResult {
  const next: Session = { state: "reclamo_identity_choice", slots: { ...slots }, counters: {} };
  return buildResult(next, [sendButtons(intro, RECLAMO_IDENTITY_BUTTONS)]);
}
