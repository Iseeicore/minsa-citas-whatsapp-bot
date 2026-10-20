import { SANDBOX_VISIBLE_SLOT_KEYS } from "@/lib/constants/sandbox-visible-slots";
import type { SendEffect, Session, Slots } from "@/lib/fsm/core/types";
import type { SandboxReply, SandboxSessionView } from "@/lib/types/sandbox-reply.types";
import { currentInteractiveId } from "@/lib/fsm/core/interactive-reply";

function pickVisibleSlots(slots: Slots): SandboxSessionView["slots"] {
  return Object.fromEntries(SANDBOX_VISIBLE_SLOT_KEYS.filter((key) => key in slots).map((key) => [key, slots[key]]));
}

export function buildSandboxReply(sent: SendEffect[], session: Session): SandboxReply {
  return {
    sent,
    session: {
      state: session.state,
      slots: pickVisibleSlots(session.slots),
      counters: { ...session.counters },
    },
    interactiveId: currentInteractiveId(session.slots),
  };
}
