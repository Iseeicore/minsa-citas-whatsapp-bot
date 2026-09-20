import type { CitaHints } from "./cita-hints";
import { beginCita, beginReclamo, buildMenuEffect } from "./flow-entry";
import { buildResult, withNote } from "./handlers-shared";
import { detectCitaRequest, isGreeting, isReclamoKeyword } from "./menu-shortcuts";
import { buildWelcomeEffect } from "./welcome";
import type { HandlerResult } from "./types";

// What a citizen gets when a conversation starts (their very first message, or
// the first one after a cita/reclamo finished). Nothing here calls the AI, and
// the citizen never gets two things at once:
//  - a greeting (or nothing readable): the branded welcome — ONE message, since a
//    WhatsApp interactive message can't hold a link button and a reply button —
//    and STOP. It invites them to write what they need; the menu comes from
//    their answer, handled by the main menu;
//  - they already asked for a cita, or to file a complaint: straight into that
//    flow, so neither the welcome nor the menu stands in front of what they said;
//  - anything else they wrote: the menu, so they can pick.
// The lexical guard runs before this, at each caller.

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de DNI (8 dígitos):`;
}

// Which of the four answers a new conversation got, on the record.
const routed = (route: "welcome" | "cita" | "reclamo" | "menu", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text?: string): HandlerResult {
  const message = text?.trim();

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: "main_menu", slots: {}, counters: {} }, [buildWelcomeEffect()]));
  }

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ initialMessageText: message }, cita, describeCitaRequest(cita)));

  if (isReclamoKeyword(message)) {
    return routed(
      "reclamo",
      beginReclamo({}, "¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu DNI a la mano?"),
    );
  }

  // Kept as the opening message: the Cita district step can still use it.
  return routed(
    "menu",
    buildResult({ state: "main_menu", slots: { initialMessageText: message }, counters: {} }, [buildMenuEffect()]),
  );
}
