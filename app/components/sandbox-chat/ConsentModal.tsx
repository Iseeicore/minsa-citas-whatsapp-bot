import { useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { SendConsentEffect } from "@/lib/fsm/core/types";

type ConsentModalProps = {
  effect: SendConsentEffect;
  onSelect: (id: string, title: string) => void;
  onClose: () => void;
};

export function ConsentModal({ effect, onSelect, onClose }: ConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [accept, decline] = effect.buttons;
  const canAccept = !effect.checkboxLabel || checked;

  const footer = (
    <>
      {effect.checkboxLabel && <Checkbox label={effect.checkboxLabel} checked={checked} onCheckedChange={setChecked} />}
      <Button
        variant={ButtonVariant.PRIMARY}
        width={ButtonWidth.FULL}
        disabled={!canAccept}
        onClick={() => onSelect(accept.id, accept.title)}
      >
        {effect.acceptLabel}
      </Button>
      <Button variant={ButtonVariant.OUTLINE} width={ButtonWidth.FULL} onClick={() => onSelect(decline.id, decline.title)}>
        {decline.title}
      </Button>
    </>
  );

  return (
    <Modal title={effect.title} onClose={onClose} footer={footer}>
      <div className="max-h-80 min-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-sb-bubble-border bg-sb-panel p-3 text-sm text-slate-700">
        {effect.content}
      </div>
    </Modal>
  );
}
