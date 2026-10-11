import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import { SendType } from "@/lib/enums/send-type";
import { PagerDirection } from "@/lib/enums/pager-direction";
import { OptionButton } from "@/app/components/ui/OptionButton";
import { BotAvatarBadge } from "@/app/components/ui/BotAvatarBadge";
import { CtaLink } from "@/app/components/ui/CtaLink";
import { PagerBar } from "@/app/components/ui/PagerBar";
import { ChatText } from "@/app/components/sandbox-chat/ChatText";
import { ListPicker } from "@/app/components/sandbox-chat/ListPicker";
import { isPagerButtonSet, pagerDirection } from "@/lib/utils/list-rows";

const CTA_HINT = "Toca aquí para ver tu agenda en MINSA Digital";

export function ChatBubble({
  entry,
  onOptionClick,
}: {
  entry: ChatEntry;
  onOptionClick: (kind: "list" | "buttons", id: string, title: string) => void;
}) {
  if (entry.from === "user") {
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
    <div className="mb-3 flex items-start gap-2">
      <BotAvatarBadge />
      <div className="min-w-0 max-w-11/12 flex-1 space-y-2">
        <div className="w-fit max-w-full rounded-2xl rounded-tl-sm border border-sb-bubble-border bg-sb-bubble-bot p-3 text-sm text-slate-800 shadow-sm">
          <ChatText text={effect.text} />
        </div>

        {effect.kind === SendType.INTERACTIVE_LIST && (
          <ListPicker rows={effect.rows} onSelect={(id, label) => onOptionClick("list", id, label)} />
        )}

        {effect.kind === SendType.CTA_URL && <CtaLink href={effect.url} label={effect.buttonText} hint={CTA_HINT} />}

        {effect.kind === SendType.BUTTONS &&
          (isPagerButtonSet(effect.buttons) ? (
            <div className="rounded-2xl border border-sb-bubble-border bg-white p-2 shadow-sm">
              <PagerBar
                prev={effect.buttons.find((button) => pagerDirection(button.id) === PagerDirection.PREV)}
                next={effect.buttons.find((button) => pagerDirection(button.id) === PagerDirection.NEXT)}
                onSelect={(id, title) => onOptionClick("buttons", id, title)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {effect.buttons.map((button) => (
                <OptionButton key={button.id} block onClick={() => onOptionClick("buttons", button.id, button.title)}>
                  {button.title}
                </OptionButton>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
