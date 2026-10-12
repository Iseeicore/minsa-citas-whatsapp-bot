import { BotMessageRow } from "@/app/components/sandbox-chat/BotMessageRow";

export function TypingIndicator() {
  return (
    <BotMessageRow>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-gray-100 bg-sb-bubble-bot px-3 py-2.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </BotMessageRow>
  );
}
