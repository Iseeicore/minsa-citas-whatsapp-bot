import { useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import type { ButtonOption, SendTerminosEffect } from "@/lib/fsm/core/types";

const CHECKBOX_LABEL = "Acepto los términos y condiciones";
const CONTINUE_LABEL = "Continuar";

type TerminosModalProps = {
  effect: SendTerminosEffect;
  onSelect: (id: string, title: string) => void;
  onClose: () => void;
};

const findButton = (buttons: ButtonOption[], id: TerminosButtonId): ButtonOption | undefined => buttons.find((button) => button.id === id);

export function TerminosModal({ effect, onSelect, onClose }: TerminosModalProps) {
  const [accepted, setAccepted] = useState(false);
  const accept = findButton(effect.buttons, TerminosButtonId.ACCEPT);
  const decline = findButton(effect.buttons, TerminosButtonId.DECLINE);

  const footer = (
    <>
      <Checkbox label={CHECKBOX_LABEL} checked={accepted} onCheckedChange={setAccepted} />
      {accept && (
        <Button
          variant={ButtonVariant.PRIMARY}
          width={ButtonWidth.FULL}
          disabled={!accepted}
          onClick={() => onSelect(accept.id, accept.title)}
        >
          {CONTINUE_LABEL}
        </Button>
      )}
      {decline && (
        <Button variant={ButtonVariant.OUTLINE} width={ButtonWidth.FULL} onClick={() => onSelect(decline.id, decline.title)}>
          {decline.title}
        </Button>
      )}
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
