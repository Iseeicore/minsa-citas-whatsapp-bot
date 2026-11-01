import { Button } from "@/app/components/ui/Button";
import { InputField, type InputFieldProps } from "@/app/components/ui/InputField";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { TextInputVariant } from "@/lib/enums/text-input-variant";

export function SearchField({
  onSearch,
  buttonLabel = "Buscar",
  ...fieldProps
}: Omit<InputFieldProps, "action" | "variant" | "type" | "onEnter"> & { onSearch: () => void; buttonLabel?: string }) {
  return (
    <InputField
      {...fieldProps}
      type="search"
      variant={TextInputVariant.PILL}
      onEnter={onSearch}
      action={
        <Button variant={ButtonVariant.PILL_TEAL} onClick={onSearch} className="px-4 py-1.5 md:px-10 md:py-2.5 md:text-2xl">
          {buttonLabel}
        </Button>
      }
    />
  );
}
