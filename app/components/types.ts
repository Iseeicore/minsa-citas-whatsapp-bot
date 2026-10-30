import type { ConversationStatus } from "@/lib/enums/conversation-status";
import type { RequestStatus } from "@/lib/enums/request-status";
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

export type ConversationMessages = {
  messages: Message[];
  windowOpen: boolean;
  windowExpiresAt: string | null;
  status: ConversationStatus;
};

export type RequestState<T> =
  | { status: RequestStatus.LOADING }
  | { status: RequestStatus.ERROR; message: string; lastData: T | undefined }
  | { status: RequestStatus.DATA; data: T };
