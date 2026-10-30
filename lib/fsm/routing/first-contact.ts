import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { beginCita, buildMenuEffect, disabledServiceReply, outOfScopeReply } from "@/lib/fsm/routing/flow-entry";
import { consultaService, incidenciaService, serviceCatalog } from "@/lib/services/service-catalog";
import { beginConsulta } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { beginReferencias } from "@/lib/fsm/flows/referencia/handlers-referencia";
import { extractCodigoIncidencia, isConsultaKeyword } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/inicio";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { emergencyCut } from "@/lib/fsm/flows/emergency/emergency";
import { buildResult, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isGreeting, isIncidenciaKeyword, isReferenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { detectOutOfScope, isCitaKeyword } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { buildWelcomeEffects } from "@/lib/fsm/routing/welcome";
import type { HandlerResult, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  FIRST_CONTACT_LEAD_TEXT,
  firstContactCitaRequestText,
  FIRST_CONTACT_CITA_TEXT,
  citaRequestEspecialidadText,
  citaRequestDistritoText,
} from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? citaRequestEspecialidadText(especialidad) : "";
  const where = distrito ? citaRequestDistritoText(distrito) : "";
  return firstContactCitaRequestText(what, where);
}

const routed = (
  route: "welcome" | "cita" | "incidencia" | "consulta" | "referencia" | "menu" | "out_of_scope",
  result: HandlerResult,
): HandlerResult => withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text: string | undefined, channel: SessionChannel): HandlerResult {
  const message = text?.trim();
  const esEmergencia = message ? detectOutOfScope(message) === OosCategory.OOS_01 : false;
  const codigo = message && !esEmergencia ? extractCodigoIncidencia(message) : undefined;
  if (codigo) {
    if (!consultaService.isEnabled()) return routed("menu", disabledServiceReply(consultaService, channel));
    return routed("consulta", beginConsulta(channel, codigo));
  }
  if (message && !esEmergencia && isConsultaKeyword(message)) {
    if (!consultaService.isEnabled()) return routed("menu", disabledServiceReply(consultaService, channel));
    return routed("consulta", beginConsulta(channel));
  }

  const inicio = message ? parseInicioIncidencia(message) : undefined;
  if (inicio?.origen === IncidenciaOrigen.QR) {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService, channel));
    return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT, inicio));
  }

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, buildWelcomeEffects(channel)));
  }

  if (isReferenciaKeyword(message)) return routed("referencia", beginReferencias({}));

  const outOfScope = detectOutOfScope(message);
  if (outOfScope === OosCategory.OOS_01) return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    return withNote(routed("out_of_scope", outOfScopeReply(outOfScope)), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  if (inicio) {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService, channel));
    return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT, inicio));
  }

  const disabledByNumber = serviceCatalog.disabledByMenuNumber(message, channel);
  if (disabledByNumber) return routed("menu", disabledServiceReply(disabledByNumber, channel));

  const numbered = serviceCatalog.byMenuNumber(message, channel)?.id;
  if (numbered === MenuChoice.AGENDAR_CITA || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, FIRST_CONTACT_CITA_TEXT));
  }
  if (numbered === MenuChoice.REGISTRAR_INCIDENCIA) return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT));
  if (numbered === MenuChoice.CONSULTAR_INCIDENCIA) return routed("consulta", beginConsulta(channel));
  if (numbered === MenuChoice.CONSULTAR_REFERENCIA) return routed("referencia", beginReferencias({}));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ [SlotKey.INITIAL_MESSAGE_TEXT]: message }, cita, describeCitaRequest(cita)));

  if (isIncidenciaKeyword(message)) {
    if (!incidenciaService.isEnabled()) return routed("menu", disabledServiceReply(incidenciaService, channel));
    return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT));
  }

  return routed(
    "menu",
    buildResult({ state: SessionState.MAIN_MENU, slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: message }, counters: {} }, [
      buildMenuEffect(channel),
    ]),
  );
}
