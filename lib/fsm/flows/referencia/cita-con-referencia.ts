import {
  buildResult,
  cloneSession,
  readTappedId,
  readTypedText,
  sendButtons,
  withLeadingText,
  withRejectionNotice,
} from "@/lib/fsm/core/handlers-shared";
import { clearOffered } from "@/lib/fsm/flows/cita/parsing/selection";
import { continueCitaAfterVerification } from "@/lib/fsm/flows/cita/steps/identity/identity";
import { offerReferenciasList, readReferencias, readReferenciasSinCupos } from "@/lib/fsm/flows/cita/steps/booking/references";
import { referenciaSeleccionadaId } from "@/lib/fsm/flows/cita/steps/booking/referencia-seleccionada";
import { esReferenciaAgendable } from "@/lib/fsm/flows/referencia/presentacion";
import { matchExactOption } from "@/lib/fsm/parsing/selection/selection-matchers";
import type { ButtonOption, HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import type { ListReferencesResult } from "@/lib/integrations/minsa/types";
import { PostLoginFlow } from "@/lib/enums/post-login-flow";
import { ReferenceStatus } from "@/lib/enums/reference-status";
import { ReferenciaEleccionButtonId } from "@/lib/enums/referencia-eleccion-button-id";
import { ReferenciaSinCuposButtonId } from "@/lib/enums/referencia-sin-cupos-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import { VERIFIED_ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-identidad";
import { ASK_DISTRITO_TEXT } from "@/lib/constants/textos/cita-ubicacion";
import {
  REFERENCIA_ELECCION_BUTTONS,
  REFERENCIA_ELECCION_QUESTION_TEXT,
  REFERENCIA_SIN_CUPOS_BUTTONS,
  REFERENCIA_SIN_CUPOS_QUESTION_TEXT,
  REFERENCIA_SIN_OTRAS_TEXT,
} from "@/lib/constants/textos/referencia";
import { uniqueBy } from "@/lib/utils/array-values";

const REFERENCIA_ELEGIDA_SLOTS = [
  SlotKey.CITA_REFERENCIA_SELECCIONADA_ID,
  SlotKey.CITA_COD_EESS,
  SlotKey.CITA_ESPECIALIDAD_ID,
  SlotKey.CITA_ESTABLECIMIENTO_NOMBRE,
  SlotKey.CITA_ESPECIALIDAD_NOMBRE,
];

const REFERENCIA_SLOTS = [
  ...REFERENCIA_ELEGIDA_SLOTS,
  SlotKey.CITA_REFERENCIAS_DATA,
  SlotKey.CITA_REFERENCIAS_SIN_CUPOS,
  SlotKey.POST_LOGIN_FLOW,
];

function chosenButton(event: InboundEvent, buttons: ButtonOption[]): string | undefined {
  return readTappedId(event) ?? matchExactOption(readTypedText(event), buttons)?.id;
}

export function askReferenciaEleccion(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(REFERENCIA_ELECCION_QUESTION_TEXT, REFERENCIA_ELECCION_BUTTONS)]);
}

export function askReferenciaSinCupos(session: Session): HandlerResult {
  return buildResult(session, [sendButtons(REFERENCIA_SIN_CUPOS_QUESTION_TEXT, REFERENCIA_SIN_CUPOS_BUTTONS)]);
}

export function citaSinReferencia(session: Session, askText: string = ASK_DISTRITO_TEXT): HandlerResult {
  const next = clearOffered(session);
  for (const slot of REFERENCIA_SLOTS) delete next.slots[slot];
  return continueCitaAfterVerification(next, askText);
}

export function continueCitaConReferencias(session: Session, result: ListReferencesResult): HandlerResult {
  const next = cloneSession(session);
  const data = result.statusReference === ReferenceStatus.FOUND ? result.data : [];
  if (!data.some(esReferenciaAgendable)) return citaSinReferencia(next, VERIFIED_ASK_DISTRITO_TEXT);

  next.slots[SlotKey.CITA_REFERENCIAS_DATA] = JSON.stringify(data);
  next.state = SessionState.CITA_AWAITING_REFERENCIA_ELECCION;
  return askReferenciaEleccion(next);
}

export function handleAwaitingReferenciaEleccion(session: Session, event: InboundEvent): HandlerResult {
  const choice = chosenButton(event, REFERENCIA_ELECCION_BUTTONS);
  if (choice === ReferenciaEleccionButtonId.CON) return offerReferenciasList(session);
  if (choice === ReferenciaEleccionButtonId.SIN) return citaSinReferencia(session);
  return withRejectionNotice(askReferenciaEleccion(session));
}

export function offerReferenciaSinCupos(session: Session): HandlerResult {
  const next = cloneSession(session);
  const sinCupos = uniqueBy(
    [...readReferenciasSinCupos(next.slots), referenciaSeleccionadaId(next.slots) ?? ""].filter(Boolean),
    (id) => id,
  );
  next.slots[SlotKey.CITA_REFERENCIAS_SIN_CUPOS] = JSON.stringify(sinCupos);
  for (const slot of REFERENCIA_ELEGIDA_SLOTS) delete next.slots[slot];

  const quedan = readReferencias(next).some((item) => esReferenciaAgendable(item) && !sinCupos.includes(item.idReferencia));
  if (!quedan) return withLeadingText(citaSinReferencia(next), REFERENCIA_SIN_OTRAS_TEXT);

  next.state = SessionState.CITA_AWAITING_REFERENCIA_SIN_CUPOS;
  return askReferenciaSinCupos(next);
}

export function handleAwaitingReferenciaSinCupos(session: Session, event: InboundEvent): HandlerResult {
  const choice = chosenButton(event, REFERENCIA_SIN_CUPOS_BUTTONS);
  if (choice === ReferenciaSinCuposButtonId.VER_OTRA) {
    const next = cloneSession(session);
    if (!next.slots[SlotKey.POST_LOGIN_FLOW]) next.slots[SlotKey.POST_LOGIN_FLOW] = PostLoginFlow.REFERENCIAS;
    return offerReferenciasList(next);
  }
  if (choice === ReferenciaSinCuposButtonId.SIN_REFERENCIA) return citaSinReferencia(session);
  return withRejectionNotice(askReferenciaSinCupos(session));
}
