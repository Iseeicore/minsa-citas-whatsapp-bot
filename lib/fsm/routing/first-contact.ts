import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { beginCita, buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/ubicacion";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { emergencyCut } from "@/lib/fsm/flows/emergency/emergency";
import { buildResult, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isGreeting, isIncidenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { detectOutOfScope, isCitaKeyword, OOS_MESSAGES } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { buildWelcomeEffect } from "@/lib/fsm/routing/welcome";
import type { HandlerResult, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const INCIDENCIA_LEAD = "¡Hola!";

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento:`;
}

const routed = (route: "welcome" | "cita" | "incidencia" | "menu" | "out_of_scope", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text: string | undefined, channel: SessionChannel): HandlerResult {
  const message = text?.trim();
  const inicio = message ? parseInicioIncidencia(message) : null;
  if (inicio?.origen === "qr") return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD, inicio));

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, [buildWelcomeEffect(channel)]));
  }

  const outOfScope = detectOutOfScope(message);
  if (outOfScope === OosCategory.OOS_01) return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    const reply = buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, [sendText(OOS_MESSAGES[outOfScope])]);
    return withNote(routed("out_of_scope", reply), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  if (inicio) return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD, inicio));

  if (message === "1" || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:"));
  }
  if (message === "2") return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ [SlotKey.INITIAL_MESSAGE_TEXT]: message }, cita, describeCitaRequest(cita)));

  if (isIncidenciaKeyword(message)) {
    return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD));
  }

  return routed(
    "menu",
    buildResult({ state: SessionState.MAIN_MENU, slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: message }, counters: {} }, [buildMenuEffect()]),
  );
}
