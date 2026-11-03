import { useEffect, useRef, type MouseEvent, type PropsWithChildren, type SyntheticEvent } from "react";
import { isBackdropClick, openModalDialog } from "@/lib/utils/modal-dialog";

type DialogProps = PropsWithChildren<{
  onClose: () => void;
  labelledBy: string;
  alert?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}>;

export function Dialog({ onClose, labelledBy, alert = false, closeOnBackdrop = false, className, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return openModalDialog(dialog, opener);
  }, []);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && isBackdropClick(event)) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClick={handleClick}
      className={className}
    >
      {children}
    </dialog>
  );
}
