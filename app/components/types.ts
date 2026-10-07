import type { ConversationStatus } from "@/lib/enums/conversation-status";
import type { MessageDirection } from "@/lib/enums/message-direction";
import type { MessageStatus } from "@/lib/enums/message-status";
import type { MessageType } from "@/lib/enums/message-type";

export type Conversation = {
  id: string;
  waId: string;
  profileName: string | null;
  status: ConversationStatus;
  lastMessageAt: string;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  waMessageId: string | null;
  status: MessageStatus;
  timestamp: string;
  createdAt: string;
};
