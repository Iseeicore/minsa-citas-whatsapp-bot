import { buildResult, sendText } from "./handlers-shared";
import type { CitaHints } from "./cita-hints";
import type { HandlerResult, Session } from "./types";

// The one way a citizen who already said what they want enters the Cita flow
// from free text: the specialty and district they named seed the hints the flow
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
