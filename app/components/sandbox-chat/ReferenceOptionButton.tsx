import { ChevronRightIcon } from "@/app/components/icons";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { ButtonWidth } from "@/lib/enums/button-width";
import type { ReferenciaListaDetalle } from "@/lib/types/referencia-lista-detalle";
import {
  REFERENCIA_ESPECIALIDAD_LABEL,
  REFERENCIA_DESTINO_LABEL,
  REFERENCIA_ORIGEN_LABEL,
  REFERENCIA_FECHA_LABEL,
  referenciaNumeroText,
} from "@/lib/constants/textos/cita-reserva";

function ReferenceField({ label, value }: { label: string; value: string }) {
  return (
    <span className="block min-w-0 text-xs text-slate-700 leading-relaxed">
      <span className="mr-1 font-semibold text-slate-500">{label}:</span>
      <span className="whitespace-normal wrap-anywhere">{value}</span>
    </span>
  );
}

function ReferenceHeading({ reference }: { reference: ReferenciaListaDetalle }) {
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-slate-500">{REFERENCIA_ESPECIALIDAD_LABEL}</span>
          <span className="block whitespace-normal wrap-anywhere text-sm font-semibold leading-snug text-sb-navy">
            {reference.especialidad}
          </span>
        </span>
        <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 wrap-anywhere text-xs font-semibold text-sb-navy">{referenciaNumeroText(reference.numero)}</span>
        {reference.estado && <Badge className="max-w-full wrap-anywhere bg-sb-panel text-sb-navy">{reference.estado}</Badge>}
      </span>
    </>
  );
}

export function ReferenceOptionButton({
  reference,
  disabled = false,
  onClick,
}: {
  reference: ReferenciaListaDetalle;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={ButtonVariant.OUTLINE}
      width={ButtonWidth.FULL}
      disabled={disabled}
      onClick={onClick}
      className="block min-w-0 border-sb-bubble-border p-3 text-left font-normal shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-navy"
    >
      <ReferenceHeading reference={reference} />
      <span className="mt-2 block space-y-1 border-t border-sb-bubble-border pt-2">
        <ReferenceField label={REFERENCIA_DESTINO_LABEL} value={reference.destino} />
        <ReferenceField label={REFERENCIA_ORIGEN_LABEL} value={reference.origen} />
        <ReferenceField label={REFERENCIA_FECHA_LABEL} value={reference.fecha} />
      </span>
    </Button>
  );
}
