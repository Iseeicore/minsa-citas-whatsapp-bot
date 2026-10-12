import { TipoDocumento } from "@/lib/enums/tipo-documento";
import { DNI_DIGITS, DNI_OR_CARNET_DIGITS, OTP_DIGITS } from "@/lib/constants/regex/identity";

const CARNET_EXTRANJERIA_LENGTH = 9;

export function isValidDniFormat(value: string): boolean {
  return DNI_DIGITS.test(value.trim());
}

export function isValidDocumentoFormat(value: string): boolean {
  return DNI_OR_CARNET_DIGITS.test(value.trim());
}

export function tipoDocumentoDe(numero: string): TipoDocumento {
  return numero.trim().length === CARNET_EXTRANJERIA_LENGTH ? TipoDocumento.CARNET_EXTRANJERIA : TipoDocumento.DNI;
}

export function isValidOtpFormat(value: string): boolean {
  return OTP_DIGITS.test(value.trim());
}
