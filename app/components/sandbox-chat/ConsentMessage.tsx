import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { ConsentModal } from "@/app/components/sandbox-chat/ConsentModal";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { SendConsentEffect } from "@/lib/fsm/core/types";

type ConsentMessageProps = {
  effect: SendConsentEffect;
  disabled: boolean;
  onSelect: (id: string, title: string) => void;
};

export function ConsentMessage({ effect, disabled, onSelect }: ConsentMessageProps) {
  const [open, setOpen] = useState(true);
  const showModal = open && !disabled;

  return (
    <>
      <Button variant={ButtonVariant.OPTION} width={ButtonWidth.FULL} disabled={disabled} onClick={() => setOpen(true)}>
        {effect.reopenLabel}
      </Button>
      {showModal && <ConsentModal effect={effect} onSelect={onSelect} onClose={() => setOpen(false)} />}
    </>
  );
}
