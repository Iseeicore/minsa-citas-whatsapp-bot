import { useEffect, useRef, type PropsWithChildren, type SyntheticEvent } from "react";
import { openModalDialog } from "@/lib/utils/modal-dialog";

type DialogProps = PropsWithChildren<{
  onClose: () => void;
  labelledBy: string;
  className?: string;
}>;

export function Dialog({ onClose, labelledBy, className, children }: DialogProps) {
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

  return (
    <dialog ref={dialogRef} aria-labelledby={labelledBy} onCancel={handleCancel} className={className}>
      {children}
    </dialog>
  );
}
