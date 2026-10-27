import type { GraphTextMessageRequest } from "@/lib/types/graph-api.types";

export function toGraphTextMessage(waId: string, text: string): GraphTextMessageRequest {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    recipient: waId,
    type: "text",
    text: { body: text },
  };
}
