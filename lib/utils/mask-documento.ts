import { ALREADY_MASKED_DNI, NON_DIGIT } from "@/lib/constants/regex/observability";
import { DOCUMENTO_DIGITOS_VISIBLES } from "@/lib/constants/limits/identity";

const MASKED = "*".repeat(DOCUMENTO_DIGITOS_VISIBLES);

export function maskDocumento(value: string): string {
  if (ALREADY_MASKED_DNI.test(value)) return value;
  const digits = value.replace(NON_DIGIT, "");
  return digits.length > DOCUMENTO_DIGITOS_VISIBLES ? `${MASKED}${digits.slice(-DOCUMENTO_DIGITOS_VISIBLES)}` : MASKED;
}
