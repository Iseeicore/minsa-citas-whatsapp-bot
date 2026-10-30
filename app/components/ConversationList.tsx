"use client";

import type { Conversation } from "@/app/components/types";
import { Avatar } from "@/app/components/ui/Avatar";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { avatarColor, initials } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils/cn";
import { formatClockTime } from "@/lib/utils/format-clock-time";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { ConversationStatus } from "@/lib/enums/conversation-status";
import { BannerTone } from "@/lib/enums/banner-tone";
import { Banner } from "@/app/components/ui/Banner";
import { readRequestData, useConversationPolling } from "@/app/components/hooks/use-conversation-polling";
import { RequestStatus } from "@/lib/enums/request-status";

const CONVERSATIONS_URL = "/api/conversations";
const LOAD_ERROR_TEXT = "No se pudieron cargar las conversaciones. La lista puede no estar al día.";
const LOADING_TEXT = "Cargando conversaciones…";
const EMPTY_TEXT = "Aún no hay conversaciones.";

export default function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}) {
  const { state } = useConversationPolling<Conversation[]>(CONVERSATIONS_URL, LOAD_ERROR_TEXT);
  const conversations = readRequestData(state) ?? [];
  const placeholder =
    state.status === RequestStatus.LOADING ? LOADING_TEXT : state.status === RequestStatus.DATA && state.data.length === 0 ? EMPTY_TEXT : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <h2 className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Conversaciones
      </h2>
      {state.status === RequestStatus.ERROR && <Banner tone={BannerTone.ERROR}>{state.message}</Banner>}
      {placeholder && <p className="px-4 py-6 text-center text-sm text-gray-400">{placeholder}</p>}
      <ul>
        {conversations.map((conversation) => {
          const label = conversation.profileName ?? conversation.waId;
          const active = selectedId === conversation.id;
          return (
            <li key={conversation.id}>
              <Button
                variant={ButtonVariant.ROW}
                width={ButtonWidth.FULL}
                selected={active}
                onClick={() => onSelect(conversation)}
              >
                <Avatar className={cn("font-semibold", avatarColor(conversation.waId))}>{initials(label)}</Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{label}</span>
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {formatClockTime(conversation.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-gray-500">{conversation.waId}</span>
                    <Badge
                      className={
                        conversation.status === ConversationStatus.OPEN
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }
                    >
                      {conversation.status === ConversationStatus.OPEN ? "Abierta" : "Cerrada"}
                    </Badge>
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
