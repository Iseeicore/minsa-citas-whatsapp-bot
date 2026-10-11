import { useEffect } from "react";

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
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="flex-1 rounded-xl border border-sb-navy bg-white px-3 py-2 text-sm font-semibold text-sb-navy transition-colors hover:bg-sb-panel"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-sb-navy px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sb-navy-dark"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
