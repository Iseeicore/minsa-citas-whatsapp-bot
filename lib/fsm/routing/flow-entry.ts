import { buildResult, sendButtons, sendList, sendText, withNote } from "@/lib/fsm/core/handlers-shared";
import { startCitaIdentity } from "@/lib/fsm/flows/cita/steps/terminos/terminos-gate";
import type { CitaHints } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import type { HandlerResult, Session, SessionChannel } from "@/lib/fsm/core/types";
import type { BotService } from "@/lib/services/bot-service";
import { referenciaService, serviceCatalog } from "@/lib/services/service-catalog";
import { SlotKey } from "@/lib/enums/slot-key";
import { SessionState } from "@/lib/enums/session-state";
import { MENU_PROMPT_TEXT } from "@/lib/constants/textos/menu";
import { REFERENCIA_CHOICE_BUTTONS, REFERENCIA_CHOICE_QUESTION_TEXT } from "@/lib/constants/textos/referencia";
import { OosCategory } from "@/lib/enums/oos-category";
import { oosMessage } from "@/lib/fsm/flows/out-of-scope/out-of-scope";

export const buildMenuEffect = (channel: SessionChannel) => sendList(MENU_PROMPT_TEXT, serviceCatalog.menuRows(channel));

export function disabledServiceReply(service: BotService, channel: SessionChannel, slots: Session["slots"] = {}): HandlerResult {
  return withNote(
    buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [sendText(service.disabledReply()), buildMenuEffect(channel)]),
    { kind: "shortcut", detail: { name: "service_disabled", service: service.id } },
  );
}

export function enterReferencias(
  slots: Session["slots"],
  channel: SessionChannel,
  begin: (slots: Session["slots"]) => HandlerResult,
): HandlerResult {
  return referenciaService.isEnabled() ? begin(slots) : disabledServiceReply(referenciaService, channel, slots);
}

export function beginCita(slots: Session["slots"], hints: CitaHints, intro: string, channel: SessionChannel): HandlerResult {
  const next: Session = {
    state: SessionState.CITA_AWAITING_DNI,
    slots: {
      ...slots,
      ...(hints.especialidad ? { [SlotKey.CITA_ESPECIALIDAD_HINT_TEXT]: hints.especialidad } : {}),
      ...(hints.distrito ? { [SlotKey.CITA_DISTRITO_HINT_TEXT]: hints.distrito } : {}),
    },
    counters: {},
    channel,
  };
  return startCitaIdentity(next, intro);
}

export function askReferenciaChoice(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(REFERENCIA_CHOICE_QUESTION_TEXT, REFERENCIA_CHOICE_BUTTONS)]);
}

export function offerReferenciaChoice(slots: Session["slots"]): HandlerResult {
  return askReferenciaChoice({ state: SessionState.MAIN_MENU_REFERENCIA_CHOICE, slots, counters: {} });
}

export function outOfScopeReply(category: OosCategory, channel: SessionChannel, slots: Session["slots"] = {}): HandlerResult {
  if (category === OosCategory.OOS_03) return enterReferencias(slots, channel, offerReferenciaChoice);
  return buildResult({ state: SessionState.MAIN_MENU, slots, counters: {} }, [sendText(oosMessage(category))]);
}
