import { PaperclipIcon, SendIcon } from "@/app/components/icons";
import { IconButton } from "@/app/components/ui/IconButton";
import { TextInput } from "@/app/components/ui/TextInput";
import { ButtonSize } from "@/lib/enums/button-size";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { TextInputVariant } from "@/lib/enums/text-input-variant";
import { cn } from "@/lib/utils/cn";

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
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-sb-navy",
          !from || loading ? "pointer-events-none opacity-50" : "cursor-pointer",
        )}
      >
        <PaperclipIcon className="h-5 w-5" ariaLabel="Adjuntar imagen" />
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
      <div className="flex flex-1 items-center rounded-xl border border-sb-bubble-border bg-sb-panel px-3 py-2 transition-colors focus-within:border-sb-navy focus-within:bg-white">
        <TextInput
          variant={TextInputVariant.INLINE}
          value={inputText}
          onValueChange={setInputText}
          onEnter={handleSend}
          disabled={!from || loading}
          placeholder="Escribe un mensaje o consulta..."
        />
      </div>
      <IconButton
        variant={ButtonVariant.ICON_SOLID_NAVY}
        size={ButtonSize.ICON_MD}
        icon={<SendIcon className="h-4 w-4" />}
        onClick={handleSend}
        disabled={!from || loading || !inputText.trim()}
        ariaLabel="Enviar mensaje"
      />
    </div>
  );
}
