import type { SendEffect } from "@/lib/fsm/core/types";

export type ChatEntry =
  | { id: string; from: "user"; text: string }
  | { id: string; from: "bot"; effect: SendEffect };
