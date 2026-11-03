import { useId, type PropsWithChildren, type ReactNode } from "react";
import { Dialog } from "@/app/components/ui/Dialog";
import { Heading } from "@/app/components/ui/Heading";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";

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
      <Heading level={2} variant={HeadingVariant.DIALOG} id={titleId}>
        {title}
      </Heading>
      {children}
      <div className="flex flex-col gap-2">{footer}</div>
    </Dialog>
  );
}
