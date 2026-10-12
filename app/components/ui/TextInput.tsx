import type { InputHTMLAttributes } from "react";
import { TextInputVariant } from "@/lib/enums/text-input-variant";

const SUBMIT_KEY = "Enter";

const VARIANT_CLASS_NAME: Record<TextInputVariant, string> = {
  [TextInputVariant.INLINE]: "flex-1 border-none bg-transparent text-sm outline-none disabled:cursor-not-allowed",
  [TextInputVariant.BOXED]:
    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-sb-accent",
  [TextInputVariant.SEARCH]: "w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400",
};

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "onKeyDown" | "value"> & {
  variant: TextInputVariant;
  type?: "text" | "search";
  value: string;
  onValueChange: (value: string) => void;
  onEnter?: () => void;
};

export function TextInput({
  variant,
  type = "text",
  value,
  onValueChange,
  onEnter,
  className = "",
  ...nativeProps
}: TextInputProps) {
  return (
    <input
      type={type}
      {...nativeProps}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={
        onEnter
          ? (event) => {
              if (event.key === SUBMIT_KEY) onEnter();
            }
          : undefined
      }
      className={`${VARIANT_CLASS_NAME[variant]} ${className}`.trim()}
    />
  );
}
