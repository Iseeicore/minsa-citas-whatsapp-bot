import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { beginCita, beginReclamo, buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { emergencyCut } from "@/lib/fsm/flows/emergency/emergency";
import { buildResult, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isGreeting, isReclamoKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { detectOutOfScope, isCitaKeyword, OOS_MESSAGES } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { buildWelcomeEffect } from "@/lib/fsm/routing/welcome";
import type { HandlerResult, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";

const RECLAMO_INTRO = "¡Hola! Vamos a registrar tu reclamo en el Libro de Reclamaciones. ¿Deseas registrar tu nombre, o prefieres que sea anónimo?";

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento (8 dígitos):`;
}

const routed = (route: "welcome" | "cita" | "reclamo" | "menu" | "out_of_scope", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text: string | undefined, channel: SessionChannel): HandlerResult {
  const message = text?.trim();

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: "main_menu", slots: {}, counters: {} }, [buildWelcomeEffect(channel)]));
  }

  const outOfScope = detectOutOfScope(message);
  if (outOfScope === OosCategory.OOS_01) return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    const reply = buildResult({ state: "main_menu", slots: {}, counters: {} }, [sendText(OOS_MESSAGES[outOfScope])]);
    return withNote(routed("out_of_scope", reply), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  if (message === "1" || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento (8 dígitos):"));
  }
  if (message === "2") return routed("reclamo", beginReclamo({}, RECLAMO_INTRO));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ [SlotKey.INITIAL_MESSAGE_TEXT]: message }, cita, describeCitaRequest(cita)));

  if (isReclamoKeyword(message)) {
    return routed("reclamo", beginReclamo({}, RECLAMO_INTRO));
  }

  return routed(
    "menu",
    buildResult({ state: "main_menu", slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: message }, counters: {} }, [buildMenuEffect()]),
  );
}
