import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import { SendType } from "@/lib/enums/send-type";
import { ChatEntryAuthor } from "@/lib/enums/chat-entry-author";
import { PagerDirection } from "@/lib/enums/pager-direction";
import { ReplyButtons } from "@/app/components/ui/ReplyButtons";
import { Card } from "@/app/components/ui/Card";
import { CtaLink } from "@/app/components/ui/CtaLink";
import { PagerBar } from "@/app/components/ui/PagerBar";
import { BotMessageRow } from "@/app/components/sandbox-chat/BotMessageRow";
import { ChatText } from "@/app/components/sandbox-chat/ChatText";
import { ChatListPicker } from "@/app/components/sandbox-chat/ChatListPicker";
import { isPagerButtonSet, pagerDirection } from "@/lib/utils/list-rows";

export function ChatBubble({
  entry,
  disabled = false,
  onOptionClick,
}: {
  entry: ChatEntry;
  disabled?: boolean;
  onOptionClick: (kind: "list" | "buttons", id: string, title: string) => void;
}) {
  if (entry.from === ChatEntryAuthor.USER) {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-3/4 rounded-2xl rounded-tr-sm bg-sb-navy px-3.5 py-2 text-sm font-medium text-white shadow-sm">
          {entry.text}
        </div>
      </div>
    );
  }

  const { effect } = entry;

  return (
    <BotMessageRow>
      <div className="min-w-0 max-w-11/12 flex-1 space-y-2">
        <div className="w-fit max-w-full rounded-2xl rounded-tl-sm border border-sb-bubble-border bg-sb-bubble-bot p-3 text-sm text-slate-800 shadow-sm">
          <ChatText text={effect.text} />
        </div>

        {effect.kind === SendType.INTERACTIVE_LIST && (
          <ChatListPicker
            rows={effect.rows}
            actions={effect.actions}
            disabled={disabled}
            onSelect={(id, label) => onOptionClick("list", id, label)}
            onActionSelect={(id, label) => onOptionClick("buttons", id, label)}
          />
        )}

        {effect.kind === SendType.CTA_URL && <CtaLink href={effect.url} label={effect.buttonText} />}

        {effect.kind === SendType.BUTTONS &&
          (isPagerButtonSet(effect.buttons) ? (
            <Card className="p-2">
              <PagerBar
                prev={effect.buttons.find((button) => pagerDirection(button.id) === PagerDirection.PREV)}
                next={effect.buttons.find((button) => pagerDirection(button.id) === PagerDirection.NEXT)}
                disabled={disabled}
                onSelect={(id, title) => onOptionClick("buttons", id, title)}
              />
            </Card>
          ) : (
            <ReplyButtons buttons={effect.buttons} disabled={disabled} onSelect={(id, title) => onOptionClick("buttons", id, title)} />
          ))}
      </div>
    </BotMessageRow>
  );
}
