import { BotAvatarBadge } from "@/app/components/ui/BotAvatarBadge";

export function TypingIndicator() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <BotAvatarBadge />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-gray-100 bg-sb-bubble-bot px-3 py-2.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
