export function TypingIndicator() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
        MD
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-gray-100 bg-[var(--sb-bubble-bot)] px-3 py-2.5 shadow-sm">
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
