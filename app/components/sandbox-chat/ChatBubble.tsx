import type { ChatEntry } from "@/app/components/sandbox-chat/types";

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
        <div className="max-w-[70%] rounded-2xl rounded-tr-none bg-[var(--sb-accent)] px-3 py-2 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }

  const { effect } = entry;

  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
        MD
      </span>
      <div className="max-w-[75%] rounded-2xl rounded-tl-none border border-gray-100 bg-[var(--sb-bubble-bot)] px-3 py-2 text-sm text-gray-800 shadow-sm">
        <div className="whitespace-pre-wrap">{effect.text}</div>

        {effect.kind === "send_interactive_list" && (
          <div className="mt-2 flex flex-col gap-1">
            {effect.rows.map((row) => (
              <button
                key={row.id}
                onClick={() => onOptionClick("list", row.id, row.title)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-left text-xs text-blue-700 hover:bg-blue-100"
              >
                <div className="font-medium">{row.title}</div>
                {row.description && <div className="text-blue-500">{row.description}</div>}
              </button>
            ))}
          </div>
        )}

        {effect.kind === "send_cta_url" && (
          <a
            href={effect.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block rounded-full border border-green-500 bg-white px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
          >
            {effect.buttonText}
          </a>
        )}

        {effect.kind === "send_buttons" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {effect.buttons.map((button) => (
              <button
                key={button.id}
                onClick={() => onOptionClick("buttons", button.id, button.title)}
                className="rounded-full border border-blue-500 bg-white px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                {button.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
