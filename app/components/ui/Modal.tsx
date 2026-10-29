import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from "react";

const CLOSE_KEY = "Escape";

type ModalProps = PropsWithChildren<{
  title: string;
  onClose: () => void;
  footer: ReactNode;
}>;

export function Modal({ title, onClose, footer, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === CLOSE_KEY) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-sb-navy/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-base font-bold text-sb-navy">
          {title}
        </h2>
        {children}
        <div className="flex flex-col gap-2">{footer}</div>
      </div>
    </div>
  );
}
