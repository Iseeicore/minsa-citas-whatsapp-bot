import { LockIcon } from "@/app/components/icons";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { TextInput } from "@/app/components/ui/TextInput";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import { TextInputVariant } from "@/lib/enums/text-input-variant";

export function DniCard({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card className="mb-3 ml-9 max-w-3/4 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-sb-accent">
        <LockIcon className="h-4 w-4" />
        Acceso rápido con Documento
      </div>
      <TextInput
        variant={TextInputVariant.BOXED}
        inputMode="numeric"
        maxLength={9}
        aria-label="Número de documento"
        value={value}
        onValueChange={onChange}
        onEnter={onSubmit}
        placeholder="Ingresa tu número de documento"
        className="mb-2"
      />
      <Button variant={ButtonVariant.ACCENT} width={ButtonWidth.FULL} onClick={onSubmit} disabled={!value.trim()}>
        Validar y Continuar Cita
      </Button>
    </Card>
  );
}
