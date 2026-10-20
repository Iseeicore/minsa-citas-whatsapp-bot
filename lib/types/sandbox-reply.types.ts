import type { SANDBOX_VISIBLE_SLOT_KEYS } from "@/lib/constants/sandbox-visible-slots";
import type { Counters, SendEffect, Session, Slots } from "@/lib/fsm/core/types";

export type SandboxVisibleSlotKey = (typeof SANDBOX_VISIBLE_SLOT_KEYS)[number];

export type SandboxSessionView = {
  state: Session["state"];
  slots: Pick<Slots, SandboxVisibleSlotKey>;
  counters: Counters;
};

export type SandboxReply = {
  sent: SendEffect[];
  session: SandboxSessionView;
  interactiveId?: string;
};
