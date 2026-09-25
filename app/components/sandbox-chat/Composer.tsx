import { PaperclipIcon, SendIcon } from "@/app/components/sandbox-chat/icons";

// The bottom input bar: attach an image, type a message, send it.
export function Composer({
  from,
  loading,
  inputText,
  setInputText,
  handleSend,
  handleImageSelect,
}: {
  from: string | null;
  loading: boolean;
  inputText: string;
  setInputText: (value: string) => void;
  handleSend: () => void;
  handleImageSelect: (fileList: FileList | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
      <label
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--sb-accent)] hover:bg-blue-50 ${
          !from || loading ? "pointer-events-none opacity-50" : "cursor-pointer"
        }`}
      >
        <PaperclipIcon className="h-5 w-5" />
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={!from || loading}
          onChange={(e) => {
            handleImageSelect(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <div className="flex flex-1 items-center rounded-full bg-gray-100 px-4 py-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          disabled={!from || loading}
          placeholder="Escribe un mensaje o consulta..."
          className="flex-1 border-none bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>
      <button
        onClick={handleSend}
        disabled={!from || loading || !inputText.trim()}
        aria-label="Enviar mensaje"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--sb-accent)] text-white transition-opacity disabled:opacity-40"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
