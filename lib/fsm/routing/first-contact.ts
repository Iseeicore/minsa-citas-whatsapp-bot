import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { beginCita, buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { beginConsulta } from "@/lib/fsm/flows/consulta/handlers-consulta";
import { extractCodigoIncidencia, isConsultaKeyword } from "@/lib/fsm/parsing/text/codigo-incidencia";
import { beginIncidencia } from "@/lib/fsm/flows/incidencia/ubicacion";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { emergencyCut } from "@/lib/fsm/flows/emergency/emergency";
import { buildResult, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { detectCitaRequest, isGreeting, isIncidenciaKeyword } from "@/lib/fsm/routing/menu-shortcuts";
import { detectOutOfScope, isCitaKeyword } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { OosCategory } from "@/lib/enums/oos-category";
import { buildWelcomeEffects } from "@/lib/fsm/routing/welcome";
import type { HandlerResult, SessionChannel } from "@/lib/fsm/core/types";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import {
  NUMERIC_MENU_CHOICES,
  FIRST_CONTACT_LEAD_TEXT,
  firstContactCitaRequestText,
  FIRST_CONTACT_CITA_TEXT,
  citaRequestEspecialidadText,
  citaRequestDistritoText,
} from "@/lib/constants/textos/menu";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { OOS_MESSAGES } from "@/lib/constants/textos/fuera-de-alcance";
import { IncidenciaOrigen } from "@/lib/enums/incidencia-origen";

function describeCitaRequest({ especialidad, distrito }: CitaHints): string {
  const what = especialidad ? citaRequestEspecialidadText(especialidad) : "";
  const where = distrito ? citaRequestDistritoText(distrito) : "";
  return firstContactCitaRequestText(what, where);
}

const routed = (route: "welcome" | "cita" | "incidencia" | "consulta" | "menu" | "out_of_scope", result: HandlerResult): HandlerResult =>
  withNote(result, { kind: "first_contact", detail: { route } });

export function handleFirstContact(text: string | undefined, channel: SessionChannel): HandlerResult {
  const message = text?.trim();
  const esEmergencia = message ? detectOutOfScope(message) === OosCategory.OOS_01 : false;
  const codigo = message && !esEmergencia ? extractCodigoIncidencia(message) : null;
  if (codigo) return routed("consulta", beginConsulta(channel, codigo));
  if (message && !esEmergencia && isConsultaKeyword(message)) return routed("consulta", beginConsulta(channel));

  const inicio = message ? parseInicioIncidencia(message) : null;
  if (inicio?.origen === IncidenciaOrigen.QR) return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT, inicio));

  if (!message || isGreeting(message)) {
    return routed("welcome", buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, buildWelcomeEffects(channel)));
  }

  const outOfScope = detectOutOfScope(message);
  if (outOfScope === OosCategory.OOS_01) return routed("out_of_scope", emergencyCut("first_contact"));
  if (outOfScope) {
    const reply = buildResult({ state: SessionState.MAIN_MENU, slots: {}, counters: {} }, [sendText(OOS_MESSAGES[outOfScope])]);
    return withNote(routed("out_of_scope", reply), { kind: "out_of_scope", detail: { category: outOfScope } });
  }

  if (inicio) return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT, inicio));

  if (NUMERIC_MENU_CHOICES[message] === MenuChoice.AGENDAR_CITA || isCitaKeyword(message)) {
    return routed("cita", beginCita({}, {}, FIRST_CONTACT_CITA_TEXT));
  }
  if (NUMERIC_MENU_CHOICES[message] === MenuChoice.REGISTRAR_INCIDENCIA) return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT));
  if (NUMERIC_MENU_CHOICES[message] === MenuChoice.CONSULTAR_INCIDENCIA) return routed("consulta", beginConsulta(channel));

  const cita = detectCitaRequest(message);
  if (cita) return routed("cita", beginCita({ [SlotKey.INITIAL_MESSAGE_TEXT]: message }, cita, describeCitaRequest(cita)));

  if (isIncidenciaKeyword(message)) {
    return routed("incidencia", beginIncidencia({}, FIRST_CONTACT_LEAD_TEXT));
  }

  return routed(
    "menu",
    buildResult({ state: SessionState.MAIN_MENU, slots: { [SlotKey.INITIAL_MESSAGE_TEXT]: message }, counters: {} }, [buildMenuEffect()]),
  );
}
