import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode, type SyntheticEvent } from "react";
import { openModalDialog } from "@/lib/utils/modal-dialog";

type ModalProps = PropsWithChildren<{
  title: string;
  onClose: () => void;
  footer: ReactNode;
}>;

export function Modal({ title, onClose, footer, children }: ModalProps) {
  const titleId = useId();
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
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      className="m-auto w-11/12 max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl outline-none backdrop:bg-sb-navy/60 open:flex"
    >
      <h2 id={titleId} className="text-base font-bold text-sb-navy">
        {title}
      </h2>
      {children}
      <div className="flex flex-col gap-2">{footer}</div>
    </dialog>
  );
}
