import { afterDescripcion, askDescripcion } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import {
  buildResult,
  cloneSession,
  omitSlot,
  readReply,
  sendButtons,
  sendText,
  truncateForRow,
  readTrimmedText,
} from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";
import {
  UNREADABLE_TEXT_RETRY,
  BORRADOR_BUTTONS,
  ASK_BORRADOR_EXTRA_TEXT,
  BORRADOR_QUESTION_TEXT,
  borradorConfirmText,
  borradorTooLongText,
} from "@/lib/constants/textos/incidencia";
import { isString } from "@/lib/utils/type-guards";
import { MAX_DESCRIPCION_LENGTH, MIN_DESCRIPCION_LENGTH, SHOWN_BORRADOR_MAX } from "@/lib/constants/limits/incidencia";

const isUsable = (borrador: string | undefined): borrador is string =>
  isString(borrador) && borrador.length >= MIN_DESCRIPCION_LENGTH && borrador.length <= MAX_DESCRIPCION_LENGTH && !looksLikeNoise(borrador);

export function enterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  const borrador = next.slots[SlotKey.INCIDENCIA_BORRADOR];

  if (isUsable(borrador)) {
    next.state = SessionState.INCIDENCIA_CONFIRM_BORRADOR;
    return buildResult(next, [sendButtons(borradorConfirmText(truncateForRow(borrador, SHOWN_BORRADOR_MAX)), BORRADOR_BUTTONS)]);
  }

  next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_BORRADOR);
  next.state = SessionState.INCIDENCIA_AWAITING_DESCRIPCION;
  return buildResult(next, [sendText(askDescripcion())]);
}

function applyText(session: Session, text: string): HandlerResult {
  const next = cloneSession(session);
  next.slots[SlotKey.DESCRIPCION_INCIDENCIA] = text;
  next.slots = omitSlot(next.slots, SlotKey.INCIDENCIA_BORRADOR);
  return afterDescripcion(next);
}

function appendExtra(session: Session, extra: string): HandlerResult {
  const borrador = session.slots[SlotKey.INCIDENCIA_BORRADOR] ?? "";
  const combined = `${borrador}\n${extra}`.trim();
  if (combined.length > MAX_DESCRIPCION_LENGTH) {
    return buildResult(session, [sendText(borradorTooLongText(MAX_DESCRIPCION_LENGTH))]);
  }
  return applyText(session, combined);
}

function askExtra(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA;
  return buildResult(next, [sendText(ASK_BORRADOR_EXTRA_TEXT)]);
}

export function handleConfirmBorrador(session: Session, event: InboundEvent): HandlerResult {
  const borrador = session.slots[SlotKey.INCIDENCIA_BORRADOR];
  if (!isUsable(borrador)) return enterDescripcion(session);

  const reply = readReply(event);
  if (reply === IncidenciaButtonId.BORRADOR_USAR) return applyText(session, borrador);
  if (reply === IncidenciaButtonId.BORRADOR_AGREGAR) return askExtra(session);

  const typed = readTrimmedText(event);
  if (!typed) return buildResult(session, [sendButtons(BORRADOR_QUESTION_TEXT, BORRADOR_BUTTONS)]);

  const confirmation = resolveConfirmation(typed);
  if (confirmation === Confirmation.YES) return applyText(session, borrador);
  if (confirmation === Confirmation.NO) return askExtra(session);
  if (looksLikeNoise(typed)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return appendExtra(session, typed);
}

export function handleAwaitingBorradorExtra(session: Session, event: InboundEvent): HandlerResult {
  const extra = readTrimmedText(event);
  if (!extra) return buildResult(session, [sendText(ASK_BORRADOR_EXTRA_TEXT)]);
  if (looksLikeNoise(extra)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return appendExtra(session, extra);
}
