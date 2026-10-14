import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { beginCita, buildMenuEffect, disabledServiceReply } from "@/lib/fsm/routing/flow-entry";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { beginConsulta } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { extractCodigoIncidencia, isConsultaKeyword } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/ubicacion";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { emergencyCut } from "@/lib/fsm/flows/emergency/emergency";
import { buildResult, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isGreeting, isIncidenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { detectOutOfScope, isCitaKeyword, oosMessage } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { buildWelcomeEffects } from "@/lib/fsm/routing/welcome";
import type { HandlerResult, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";

const INCIDENCIA_LEAD = "¡Hola!";

const incidenciaService = serviceCatalog.byId(MenuChoice.REGISTRAR_INCIDENCIA);
const consultaService = serviceCatalog.byId(MenuChoice.CONSULTAR_INCIDENCIA);

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? ` de ${especialidad}` : "";
  const where = distrito ? ` en ${distrito}` : "";
  return `¡Hola! Te ayudaremos a agendar tu cita${what}${where}. Para comenzar, por favor indícanos tu número de documento:`;
}

const routed = (route: "welcome" | "cita" | "incidencia" | "consulta" | "menu" | "out_of_scope", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text: string | undefined, channel: SessionChannel): HandlerResult {
  const message = text?.trim();
  const esEmergencia = message ? detectOutOfScope(message) === OosCategory.OOS_01 : false;
  const codigo = message && !esEmergencia ? extractCodigoIncidencia(message) : null;
  if (codigo) {
    if (!consultaService.isEnabled()) return routed("menu", disabledServiceReply(consultaService));
    return routed("consulta", beginConsulta(channel, codigo));
  }
  if (message && !esEmergencia && isConsultaKeyword(message)) {
    if (!consultaService.isEnabled()) return routed("menu", disabledServiceReply(consultaService));
    return routed("consulta", beginConsulta(channel));
  }

  const inicio = message ? parseInicioIncidencia(message) : null;
  if (inicio?.origen === "qr") {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService));
    return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD, inicio));
  }

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, buildWelcomeEffects(channel)));
  }

  const outOfScope = detectOutOfScope(message);
  if (outOfScope === OosCategory.OOS_01) return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    const reply = buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, [sendText(oosMessage(outOfScope))]);
    return withNote(routed("out_of_scope", reply), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  if (inicio) {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService));
    return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD, inicio));
  }

  const numbered = serviceCatalog.byMenuNumber(message)?.id;
  if (numbered === MenuChoice.AGENDAR_CITA || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, "¡Hola! Vamos a agendar tu cita. Para comenzar, por favor indícanos tu número de documento:"));
  }
  if (numbered === MenuChoice.REGISTRAR_INCIDENCIA) return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD));
  if (numbered === MenuChoice.CONSULTAR_INCIDENCIA) return routed("consulta", beginConsulta(channel));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ [SlotKey.INITIAL_MESSAGE_TEXT]: message }, cita, describeCitaRequest(cita)));

  if (isIncidenciaKeyword(message)) {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService));
    return routed("incidencia", beginIncidencia({}, INCIDENCIA_LEAD));
  }

  return routed(
    "menu",
    buildResult({ state: SessionState.MAIN_MENU, slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: message }, counters: {} }, [buildMenuEffect()]),
  );
}
