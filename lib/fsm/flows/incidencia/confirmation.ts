import { readReply } from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import type { InboundEvent } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";
import type { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";

export function readConfirmation(event: InboundEvent, yes: IncidenciaButtonId, no: IncidenciaButtonId): Confirmation | undefined {
  const reply = readReply(event);
  if (reply === yes) return Confirmation.YES;
  if (reply === no) return Confirmation.NO;
  const typed = (event.text ?? "").trim();
  if (!typed) return undefined;
  const resolved = resolveConfirmation(typed);
  return resolved === Confirmation.YES || resolved === Confirmation.NO ? resolved : undefined;
}
