import { readTappedId, readTrimmedText } from "@/lib/fsm/core/handlers-shared";
import { resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import type { InboundEvent } from "@/lib/fsm/core/types";
import { Confirmation } from "@/lib/enums/confirmation";

export function readConfirmation<T extends string>(event: InboundEvent, yes: T, no: T): Confirmation | undefined {
  const reply = readTappedId(event);
  if (reply === yes) return Confirmation.YES;
  if (reply === no) return Confirmation.NO;
  const typed = readTrimmedText(event);
  if (!typed) return undefined;
  const resolved = resolveConfirmation(typed);
  return resolved === Confirmation.YES || resolved === Confirmation.NO ? resolved : undefined;
}
