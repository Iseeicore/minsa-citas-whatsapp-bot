import { ChevronRightIcon } from "@/app/components/icons";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { ButtonVariant } from "@/lib/enums/button-variant";
import type { ReferenciaListaDetalle } from "@/lib/types/referencia-lista-detalle";
import {
  REFERENCIA_ESPECIALIDAD_LABEL,
  REFERENCIA_DESTINO_LABEL,
  REFERENCIA_ORIGEN_LABEL,
  REFERENCIA_FECHA_LABEL,
  referenciaNumeroText,
} from "@/lib/constants/textos/cita-reserva";

const referenceAccessibleName = (reference: ReferenciaListaDetalle): string =>
  [reference.especialidad, referenciaNumeroText(reference.numero), reference.estado].filter(Boolean).join(", ");

function ReferenceField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-xs text-slate-700 leading-relaxed">
      <span className="mr-1 font-semibold text-slate-500">{label}:</span>
      <span className="whitespace-normal wrap-anywhere">{value}</span>
    </div>
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
    <div className="relative w-full min-w-0 rounded-xl border border-sb-bubble-border bg-white p-3 text-left text-sm text-sb-navy shadow-sm transition-colors hover:bg-sb-panel has-disabled:opacity-50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-500">{REFERENCIA_ESPECIALIDAD_LABEL}</div>
          <div className="whitespace-normal wrap-anywhere text-sm font-semibold leading-snug text-sb-navy">{reference.especialidad}</div>
        </div>
        <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 wrap-anywhere text-xs font-semibold text-sb-navy">{referenciaNumeroText(reference.numero)}</span>
        {reference.estado && <Badge className="max-w-full wrap-anywhere bg-sb-panel text-sb-navy">{reference.estado}</Badge>}
      </div>
      <div className="mt-2 space-y-1 border-t border-sb-bubble-border pt-2">
        <ReferenceField label={REFERENCIA_DESTINO_LABEL} value={reference.destino} />
        <ReferenceField label={REFERENCIA_ORIGEN_LABEL} value={reference.origen} />
        <ReferenceField label={REFERENCIA_FECHA_LABEL} value={reference.fecha} />
      </div>
      <Button variant={ButtonVariant.COVER} disabled={disabled} onClick={onClick} aria-label={referenceAccessibleName(reference)} />
    </div>
  );
}
