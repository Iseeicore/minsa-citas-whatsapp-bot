import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Checkbox({ label, checked, onCheckedChange, className, ...nativeProps }: CheckboxProps) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-slate-700", className)}>
      <input
        type="checkbox"
        {...nativeProps}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-4 accent-sb-navy"
      />
      {label}
    </label>
  );
}
