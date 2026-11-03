import { useId } from "react";
import { Button } from "@/app/components/ui/Button";
import { Dialog } from "@/app/components/ui/Dialog";
import { Heading } from "@/app/components/ui/Heading";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      onClose={onCancel}
      labelledBy={titleId}
      alert
      className="m-auto w-11/12 max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-2xl outline-none backdrop:bg-sb-navy/60"
    >
      <Heading level={2} variant={HeadingVariant.DIALOG} id={titleId}>
        {title}
      </Heading>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex gap-2 pt-1">
        <Button variant={ButtonVariant.OUTLINE} width={ButtonWidth.GROW} autoFocus onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={ButtonVariant.PRIMARY} width={ButtonWidth.GROW} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
