import { SendType } from "@/lib/enums/send-type";
import type { SendButtonsEffect, SendEffect, SendInteractiveListEffect, SendTerminosEffect } from "@/lib/fsm/core/types";

export function isInteractiveEffect(effect: SendEffect): effect is SendButtonsEffect | SendInteractiveListEffect | SendTerminosEffect {
  return effect.kind === SendType.BUTTONS || effect.kind === SendType.INTERACTIVE_LIST || effect.kind === SendType.TERMINOS;
}
