import { SearchIcon } from "@/app/components/icons";
import { TextInput } from "@/app/components/ui/TextInput";
import { TextInputVariant } from "@/lib/enums/text-input-variant";

export function ListPickerSearch({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-sb-bubble-border bg-sb-panel px-3 py-1.5 transition-colors focus-within:border-sb-navy focus-within:bg-white">
      <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
      <TextInput
        variant={TextInputVariant.SEARCH}
        type="search"
        value={query}
        onValueChange={onChange}
        placeholder="Buscar en la lista…"
        aria-label="Buscar en la lista"
      />
    </label>
  );
}
