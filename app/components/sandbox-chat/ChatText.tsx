import type { ComponentType } from "react";
import { PeruFlagIcon, WarningIcon } from "@/app/components/icons";
import { ChatIconName } from "@/lib/enums/chat-icon-name";
import { ChatTokenKind } from "@/lib/enums/chat-token-kind";
import { splitParagraphs, tokenizeChatText, type ChatToken } from "@/lib/utils/format-chat-text";

const ICON_BY_NAME: Record<ChatIconName, { Icon: ComponentType<{ className?: string }>; className: string }> = {
  [ChatIconName.PERU_FLAG]: { Icon: PeruFlagIcon, className: "inline-block h-3.5 w-5 rounded-sm align-middle shadow-sm" },
  [ChatIconName.WARNING]: { Icon: WarningIcon, className: "inline-block h-4 w-4 align-text-bottom text-amber-500" },
};

function renderToken(token: ChatToken, index: number) {
  switch (token.kind) {
    case ChatTokenKind.BOLD:
      return <strong key={index}>{token.value}</strong>;
    case ChatTokenKind.ITALIC:
      return <em key={index}>{token.value}</em>;
    case ChatTokenKind.ICON: {
      const { Icon, className } = ICON_BY_NAME[token.icon];
      return <Icon key={index} className={className} />;
    }
    default:
      return token.value;
  }
}

export function ChatText({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed">
      {splitParagraphs(text).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {tokenizeChatText(paragraph).map(renderToken)}
        </p>
      ))}
    </div>
  );
}
