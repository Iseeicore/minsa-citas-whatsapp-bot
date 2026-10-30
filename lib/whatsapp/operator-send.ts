import { ACTOR_OPERADOR_BANDEJA } from "@/lib/db/actor";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { InboxSendFailure } from "@/lib/enums/inbox-send-failure";
import { OperatorSendStatus } from "@/lib/enums/operator-send-status";
import { SendOutcomeKind } from "@/lib/enums/send-outcome-kind";
import { toGraphFailureErrorCode } from "@/lib/inbox/graph-failure";
import { recordOutboundMessage } from "@/lib/inbox/repository";
import { logger } from "@/lib/observability/logger";
import { sendOperatorText } from "@/lib/whatsapp/whatsapp-send";

type RecordedMessage = Awaited<ReturnType<typeof recordOutboundMessage>>;

export type OperatorSendResult =
  | { status: OperatorSendStatus.SENT; message: RecordedMessage }
  | { status: OperatorSendStatus.FAILED; errorCode: ApiErrorCode.WHATSAPP_REJECTED | ApiErrorCode.WHATSAPP_UNAVAILABLE };

export async function sendOperatorMessage(conversation: { id: string; waId: string }, text: string): Promise<OperatorSendResult> {
  const outcome = await sendOperatorText(conversation.waId, text);

  switch (outcome.kind) {
    case SendOutcomeKind.FAILED:
      logger.error("inbox.send_failed", { conversationId: conversation.id, reason: InboxSendFailure.REQUEST_FAILED });
      return { status: OperatorSendStatus.FAILED, errorCode: ApiErrorCode.WHATSAPP_UNAVAILABLE };
    case SendOutcomeKind.REJECTED:
      logger.error("inbox.send_failed", { conversationId: conversation.id, reason: InboxSendFailure.GRAPH_ERROR, status: outcome.status });
      return { status: OperatorSendStatus.FAILED, errorCode: toGraphFailureErrorCode(outcome.status) };
    case SendOutcomeKind.SENT:
    case SendOutcomeKind.SENT_NO_ID: {
      const messageId = outcome.kind === SendOutcomeKind.SENT ? outcome.messageId : null;
      const message = await recordOutboundMessage(conversation.id, text, messageId, ACTOR_OPERADOR_BANDEJA);
      return { status: OperatorSendStatus.SENT, message };
    }
  }
}
