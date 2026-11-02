import { useId, type PropsWithChildren, type ReactNode } from "react";
import { Dialog } from "@/app/components/ui/Dialog";

type ModalProps = PropsWithChildren<{
  title: string;
  onClose: () => void;
  footer: ReactNode;
}>;

export function Modal({ title, onClose, footer, children }: ModalProps) {
  const titleId = useId();

  return (
    <Dialog
      onClose={onClose}
      labelledBy={titleId}
      className="m-auto w-11/12 max-w-md flex-col gap-4 rounded-2xl bg-white p-5 shadow-2xl outline-none backdrop:bg-sb-navy/60 open:flex"
    >
      <h2 id={titleId} className="text-base font-bold text-sb-navy">
        {title}
      </h2>
      {children}
      <div className="flex flex-col gap-2">{footer}</div>
    </Dialog>
  );
}
