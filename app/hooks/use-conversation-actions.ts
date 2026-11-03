"use client";

import type { Conversation, ConversationMessages, Message } from "@/app/components/types";
import { useApi } from "@/app/hooks/use-api";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";

const SEND_MESSAGE_URL = "/api/messages/send";

type ConversationActions = {
  send: (text: string) => Promise<boolean>;
  close: () => Promise<void>;
  sending: boolean;
  sendError?: string;
  closing: boolean;
  closeError?: string;
};

export function useConversationActions(
  conversationId: string,
  update: (change: (data: ConversationMessages) => ConversationMessages) => void,
): ConversationActions {
  const { state: sendState, post: postMessage } = useApi<Message>("No se pudo enviar el mensaje.");
  const { state: closeState, post: postClose } = useApi<Conversation>("No se pudo cerrar la conversación.");

  async function send(text: string): Promise<boolean> {
    if (!text.trim()) return false;
    const result = await postMessage(SEND_MESSAGE_URL, { conversationId, text });
    if (result.status !== ApiRequestStatus.DATA) return false;

    const { data: created } = result;
    update((current) => ({ ...current, messages: [...current.messages, created] }));
    return true;
  }

  async function close(): Promise<void> {
    const result = await postClose(`/api/conversations/${conversationId}/close`);
    if (result.status !== ApiRequestStatus.DATA) return;

    const { data: conversation } = result;
    update((current) => ({ ...current, status: conversation.status }));
  }

  return {
    send,
    close,
    sending: sendState.status === ApiRequestStatus.LOADING,
    sendError: sendState.status === ApiRequestStatus.ERROR ? sendState.message : undefined,
    closing: closeState.status === ApiRequestStatus.LOADING,
    closeError: closeState.status === ApiRequestStatus.ERROR ? closeState.message : undefined,
  };
}
