import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { TerminosModal } from "@/app/components/sandbox-chat/TerminosModal";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { SendTerminosEffect } from "@/lib/fsm/core/types";

const REOPEN_LABEL = "Revisar términos y condiciones";

type TerminosMessageProps = {
  effect: SendTerminosEffect;
  disabled: boolean;
  onSelect: (id: string, title: string) => void;
};

export function TerminosMessage({ effect, disabled, onSelect }: TerminosMessageProps) {
  const [open, setOpen] = useState(true);
  const showModal = open && !disabled;

  return (
    <>
      <Button variant={ButtonVariant.OPTION} width={ButtonWidth.FULL} disabled={disabled} onClick={() => setOpen(true)}>
        {REOPEN_LABEL}
      </Button>
      {showModal && <TerminosModal effect={effect} onSelect={onSelect} onClose={() => setOpen(false)} />}
    </>
  );
}
