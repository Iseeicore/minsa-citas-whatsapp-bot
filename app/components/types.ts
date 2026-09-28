export type Conversation = {
  id: string;
  waId: string;
  profileName: string | null;
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "LOCATION" | "TEMPLATE" | "UNKNOWN";
  content: string | null;
  mediaUrl: string | null;
  waMessageId: string | null;
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  timestamp: string;
  createdAt: string;
};
