import type { GraphResultStatus } from "@/lib/enums/graph-result-status";

export type GraphResult<T> =
  { status: GraphResultStatus.DATA; data: T } | { status: GraphResultStatus.ERROR; httpStatus: number; error: unknown };

export type GraphTextMessageRequest = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  recipient: string;
  type: "text";
  text: { body: string };
};

export type GraphSendMessageResponse = {
  messages?: { id: string }[];
};
