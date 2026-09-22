import type { CitaHints } from "./cita-hints";
import { beginCita, beginReclamo, buildMenuEffect } from "./flow-entry";
import { emergencyCut } from "./emergency";
import { buildResult, sendText, withNote } from "./handlers-shared";
import { detectCitaRequest, isGreeting, isReclamoKeyword } from "./menu-shortcuts";
import { detectOutOfScope, isCitaKeyword, OOS_MESSAGES } from "./out-of-scope";
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

const RECLAMO_INTRO = "¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Tienes tu documento de identidad a la mano?";

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento (8 dígitos):`;
}

// Which of the four answers a new conversation got, on the record.
const routed = (route: "welcome" | "cita" | "reclamo" | "menu" | "out_of_scope", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text?: string): HandlerResult {
  const message = text?.trim();

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: "main_menu", slots: {}, counters: {} }, [buildWelcomeEffect()]));
  }

  // A consultation the channel does not attend (emergency, SIS, vaccines...): the
  // fixed message that points to the official channel, and the menu waits.
  const outOfScope = detectOutOfScope(message);
  // A medical emergency is not a consultation to answer and wait: it ends the
  // conversation with the numbers to call (see emergency.ts).
  if (outOfScope === "OOS-01") return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    const reply = buildResult({ state: "main_menu", slots: {}, counters: {} }, [sendText(OOS_MESSAGES[outOfScope])]);
    return withNote(routed("out_of_scope", reply), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  // The rejection text offers "[1] Citas [2] Reclamos", and the out-of-scope
  // messages ask for CITAS: answering must work even though there is no menu on
  // screen yet.
  if (message === "1" || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento (8 dígitos):"));
  }
  if (message === "2") return routed("reclamo", beginReclamo({}, RECLAMO_INTRO));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ initialMessageText: message }, cita, describeCitaRequest(cita)));

  if (isReclamoKeyword(message)) {
    return routed("reclamo", beginReclamo({}, RECLAMO_INTRO));
  }

  // Kept as the opening message: the Cita district step can still use it.
  return routed(
    "menu",
    buildResult({ state: "main_menu", slots: { initialMessageText: message }, counters: {} }, [buildMenuEffect()]),
  );
}
