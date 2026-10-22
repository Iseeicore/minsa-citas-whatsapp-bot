import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { referenciaListDescriptionText } from "@/lib/constants/textos/cita-reserva";
import { WHATSAPP_REFERENCE_DESTINO_MIN_LENGTH } from "@/lib/constants/limits/whatsapp-reference";

export type ReferenceRowDescriptionParts = {
  destino: string;
  numero: string;
  fecha: string;
  estado: string;
};

const render = ({ destino, numero, fecha, estado }: ReferenceRowDescriptionParts): string =>
  referenciaListDescriptionText(destino, numero, fecha, estado);

function shorten(value: string, overflow: number): string {
  const kept = Math.max(value.length - overflow, Math.min(value.length, WHATSAPP_REFERENCE_DESTINO_MIN_LENGTH));
  return kept < value.length ? truncateForRow(value, kept) : value;
}

export function referenceRowDescription(parts: ReferenceRowDescriptionParts, maxLength: number): string {
  const overflow = render(parts).length - maxLength;
  if (overflow <= 0) return render(parts);

  const withDestino = { ...parts, destino: shorten(parts.destino, overflow) };
  const remaining = render(withDestino).length - maxLength;
  if (remaining <= 0) return render(withDestino);

  return truncateForRow(render({ ...withDestino, estado: shorten(parts.estado, remaining) }), maxLength);
}
