import { useEffect } from "react";
import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";

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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-sb-navy/60 p-4"
    >
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-2xl">
        <h2 id="confirm-dialog-title" className="text-base font-bold text-sb-navy">
          {title}
        </h2>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex gap-2 pt-1">
          <Button variant={ButtonVariant.OUTLINE} width={ButtonWidth.GROW} autoFocus onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={ButtonVariant.PRIMARY} width={ButtonWidth.GROW} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
