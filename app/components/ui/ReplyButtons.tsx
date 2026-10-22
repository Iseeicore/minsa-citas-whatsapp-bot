import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { ButtonOption } from "@/lib/fsm/core/types";

export function ReplyButtons({
  buttons,
  disabled = false,
  variant = ButtonVariant.OPTION,
  onSelect,
}: {
  buttons: ButtonOption[];
  disabled?: boolean;
  variant?: ButtonVariant;
  onSelect: (id: string, title: string) => void;
}) {
  if (buttons.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {buttons.map((button) => (
        <Button
          key={button.id}
          variant={variant}
          width={ButtonWidth.FULL}
          disabled={disabled}
          onClick={() => onSelect(button.id, button.title)}
        >
          {button.title}
        </Button>
      ))}
    </div>
  );
}
