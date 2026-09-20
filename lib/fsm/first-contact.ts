import { beginCita } from "./cita-entry";
import type { CitaHints } from "./cita-hints";
import { buildResult } from "./handlers-shared";
import { detectCitaRequest, isGreeting } from "./menu-shortcuts";
import { buildWelcomeEffect, buildWelcomeFollowupEffect } from "./welcome";
import type { HandlerResult, Session } from "./types";

// What a citizen gets when a conversation starts (their very first message, or
// the first one after a cita/reclamo finished). Two outcomes, never both:
//  - they already asked for a cita: straight into the Cita flow, asking the DNI
//    — the welcome and the menu would only bury what they said;
//  - anything else: the branded welcome and its "Seguir aquí" button, and STOP.
//    The menu is not sent here: it comes from the citizen's answer (the button
//    or a message), handled by the main menu.
// The lexical guard runs before this, at each caller.

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):`;
}

export function handleFirstContact(text?: string): HandlerResult {
  const message = text?.trim();
  const cita = message ? detectCitaRequest(message) : undefined;

  if (message && cita) {
    return beginCita({ initialMessageText: message }, cita, describeCitaRequest(cita));
  }

  // A bare greeting must not become the "opening message" later used as
  // context (same rule as the main menu).
  const slots: Session["slots"] = message && !isGreeting(message) ? { initialMessageText: message } : {};
  return buildResult({ state: "main_menu", slots, counters: {} }, [
    buildWelcomeEffect(),
    buildWelcomeFollowupEffect(),
  ]);
}
