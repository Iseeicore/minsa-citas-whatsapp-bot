import { readReply, sendText } from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import type { HandlerResult, InboundEvent } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import type { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";

export const FALLBACK_TEXT = "No pudimos identificar tu respuesta. Selecciona una de las opciones mostradas.";

/** Antepone un aviso de "no entendimos tu respuesta" a un resultado que vuelve a preguntar lo mismo. */
export function withRejectionNotice(result: HandlerResult, text: string = FALLBACK_TEXT): HandlerResult {
  return { ...result, effects: [sendText(text), ...result.effects] };
}

/** Lee Sí/No desde un botón conocido o, si no hay botón, desde el texto libre. */
export function readConfirmation(event: InboundEvent, yes: IncidenciaButtonId, no: IncidenciaButtonId): Confirmation | undefined {
  const reply = readReply(event);
  if (reply === yes) return Confirmation.YES;
  if (reply === no) return Confirmation.NO;
  const typed = (event.text ?? "").trim();
  if (!typed) return undefined;
  const resolved = resolveConfirmation(typed);
  return resolved === Confirmation.YES || resolved === Confirmation.NO ? resolved : undefined;
}
