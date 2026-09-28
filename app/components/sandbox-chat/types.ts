import type { SendEffect } from "@/lib/fsm/core/types";

export type SessionSnapshot = {
  state: string;
  slots: Record<string, unknown>;
  counters: Record<string, number>;
};

export type ChatEntry =
  | { id: string; from: "user"; text: string }
  | { id: string; from: "bot"; effect: SendEffect };
