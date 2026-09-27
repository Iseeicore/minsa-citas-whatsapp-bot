import type { ChatEntry } from "@/app/components/sandbox-chat/types";
import { SendType } from "@/lib/enums/send-type";
import { OptionButton, OptionListRow } from "@/app/components/ui/OptionButton";

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
        <div className="max-w-[70%] rounded-2xl rounded-tr-none bg-sb-accent px-3 py-2 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }

  const { effect } = entry;

  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
        MD
      </span>
      <div className="max-w-[75%] rounded-2xl rounded-tl-none border border-gray-100 bg-sb-bubble-bot px-3 py-2 text-sm text-gray-800 shadow-sm">
        <div className="whitespace-pre-wrap">{effect.text}</div>

        {effect.kind === SendType.INTERACTIVE_LIST && (
          <div className="mt-2 flex flex-col gap-1">
            {effect.rows.map((row) => (
              <OptionListRow
                key={row.id}
                onClick={() => onOptionClick("list", row.id, row.title)}
                title={row.title}
                description={row.description}
              />
            ))}
          </div>
        )}

        {effect.kind === SendType.CTA_URL && (
          <OptionButton href={effect.url} tone="green" className="mt-2 inline-block">
            {effect.buttonText}
          </OptionButton>
        )}

        {effect.kind === SendType.BUTTONS && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {effect.buttons.map((button) => (
              <OptionButton key={button.id} onClick={() => onOptionClick("buttons", button.id, button.title)}>
                {button.title}
              </OptionButton>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
