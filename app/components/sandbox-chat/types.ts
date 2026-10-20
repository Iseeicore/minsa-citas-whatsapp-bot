import type { SendEffect } from "@/lib/fsm/core/types";
import { ChatEntryAuthor } from "@/lib/enums/chat-entry-author";

export type ChatEntry =
  | { id: string; from: ChatEntryAuthor.USER; text: string }
  | { id: string; from: ChatEntryAuthor.BOT; effect: SendEffect; interactiveId?: string };
