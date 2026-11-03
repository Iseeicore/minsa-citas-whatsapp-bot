import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { LegalDocument } from "@/app/components/ui/LegalDocument";
import { LogoPeru } from "@/app/components/ui/LogoPeru";
import { useConsentChecks } from "@/app/hooks/use-consent-checks";
import { useScrolledToEnd } from "@/app/hooks/use-scrolled-to-end";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { SendConsentEffect } from "@/lib/fsm/core/types";

type ConsentModalProps = {
  effect: SendConsentEffect;
  onSelect: (id: string, title: string) => void;
  onClose: () => void;
};

export function ConsentModal({ effect, onSelect, onClose }: ConsentModalProps) {
  const { checked, toggle, allChecked } = useConsentChecks(effect.checks);
  const { ref, scrolledToEnd, onScroll } = useScrolledToEnd<HTMLDivElement>();
  const [accept, decline] = effect.buttons;

  const footer = (
    <>
      {effect.checks.map((check) => (
        <Checkbox
          key={check.id}
          label={check.label}
          checked={checked.has(check.id)}
          disabled={!scrolledToEnd}
          onCheckedChange={() => toggle(check.id)}
        />
      ))}
      <Button
        variant={ButtonVariant.PRIMARY}
        width={ButtonWidth.FULL}
        disabled={!allChecked}
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
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex max-h-80 min-h-40 flex-col gap-4 overflow-y-auto rounded-xl border border-sb-bubble-border bg-sb-panel p-3"
      >
        <LogoPeru />
        <LegalDocument apartados={effect.content} />
      </div>
    </Modal>
  );
}
