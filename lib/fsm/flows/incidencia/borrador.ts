import { afterDescripcion, askDescripcion, UNREADABLE_TEXT_RETRY } from "@/lib/fsm/flows/incidencia/pasos-comunes";
import { buildResult, cloneSession, omitSlot, readReply, sendButtons, sendText, truncateForRow } from "@/lib/fsm/core/handlers-shared";
import type { HandlerResult, InboundEvent, Session } from "@/lib/fsm/core/types";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { MAX_DESCRIPCION_LENGTH, MIN_DESCRIPCION_LENGTH } from "@/lib/recepcion/dto";
import { looksLikeNoise } from "@/lib/security/text-noise";
import { Confirmation } from "@/lib/enums/confirmation";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { SessionState } from "@/lib/enums/session-state";
import { SlotKey } from "@/lib/enums/slot-key";

const SHOWN_BORRADOR_MAX = 800;

export const BORRADOR_BUTTONS = [
  { id: IncidenciaButtonId.BORRADOR_USAR, title: "Usar así" },
  { id: IncidenciaButtonId.BORRADOR_AGREGAR, title: "Agregar más" },
];

const isUsable = (borrador: string | undefined): borrador is string =>
  typeof borrador === "string" && borrador.length >= MIN_DESCRIPCION_LENGTH && borrador.length <= MAX_DESCRIPCION_LENGTH && !looksLikeNoise(borrador);

/** Punto donde se pide el relato: si la persona ya escribió algo aprovechable, se lo muestra y le pregunta; si no, se lo pide. */
export function enterDescripcion(session: Session): HandlerResult {
  const next = cloneSession(session);
  const borrador = next.slots[SlotKey.INCIDENCIA_BORRADOR];

  if (isUsable(borrador)) {
    next.state = SessionState.INCIDENCIA_CONFIRM_BORRADOR;
    return buildResult(next, [
      sendButtons(
        `Esto es lo que escribiste:\n\n«${truncateForRow(borrador, SHOWN_BORRADOR_MAX)}»\n\n¿Lo usamos tal cual o quieres agregar más?`,
        BORRADOR_BUTTONS,
      ),
    ]);
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
    return buildResult(session, [sendText(`Con lo que ya escribiste, el texto no puede pasar de ${MAX_DESCRIPCION_LENGTH} caracteres. Escribe algo más corto.`)]);
  }
  return applyText(session, combined);
}

function askExtra(session: Session): HandlerResult {
  const next = cloneSession(session);
  next.state = SessionState.INCIDENCIA_AWAITING_BORRADOR_EXTRA;
  return buildResult(next, [sendText("Escribe lo que quieras agregar.")]);
}

export function handleConfirmBorrador(session: Session, event: InboundEvent): HandlerResult {
  const borrador = session.slots[SlotKey.INCIDENCIA_BORRADOR];
  if (!isUsable(borrador)) return enterDescripcion(session);

  const reply = readReply(event);
  if (reply === IncidenciaButtonId.BORRADOR_USAR) return applyText(session, borrador);
  if (reply === IncidenciaButtonId.BORRADOR_AGREGAR) return askExtra(session);

  const typed = (event.text ?? "").trim();
  if (!typed) return buildResult(session, [sendButtons("¿Usamos tu texto tal cual o quieres agregar más?", BORRADOR_BUTTONS)]);

  const confirmation = resolveConfirmation(typed);
  if (confirmation === Confirmation.YES) return applyText(session, borrador);
  if (confirmation === Confirmation.NO) return askExtra(session);
  if (looksLikeNoise(typed)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return appendExtra(session, typed);
}

export function handleAwaitingBorradorExtra(session: Session, event: InboundEvent): HandlerResult {
  const extra = (event.text ?? "").trim();
  if (!extra) return buildResult(session, [sendText("Escribe lo que quieras agregar.")]);
  if (looksLikeNoise(extra)) return buildResult(session, [sendText(UNREADABLE_TEXT_RETRY)]);
  return appendExtra(session, extra);
}
