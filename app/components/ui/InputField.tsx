import type { ReactNode } from "react";
import { TextInput, type TextInputProps } from "@/app/components/ui/TextInput";
import { cn } from "@/lib/utils/cn";

export type InputFieldProps = TextInputProps & {
  id: string;
  label: ReactNode;
  labelClassName?: string;
  action?: ReactNode;
};

export function InputField({ id, label, labelClassName, action, className, ...inputProps }: InputFieldProps) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <label htmlFor={id} className={cn("block", labelClassName)}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2 md:mt-2 md:gap-4">
        <TextInput id={id} {...inputProps} />
        {action}
      </div>
    </div>
  );
}
