import { TipoDocumento } from "@/lib/enums/tipo-documento";

const CARNET_EXTRANJERIA_LENGTH = 9;

const DNI_DIGITS = /^\d{8}$/;
const DNI_OR_CARNET_DIGITS = /^\d{8,9}$/;
const OTP_DIGITS = /^\d{4,8}$/;

export function isValidDniFormat(value: string): boolean {
  return DNI_DIGITS.test(value.trim());
}

export function isValidDocumentoFormat(value: string): boolean {
  return DNI_OR_CARNET_DIGITS.test(value.trim());
}

/** El largo decide el tipo: 9 dígitos es carnet de extranjería y 8 es DNI. Se llama solo con un documento ya validado. */
export function tipoDocumentoDe(numero: string): TipoDocumento {
  return numero.trim().length === CARNET_EXTRANJERIA_LENGTH ? TipoDocumento.CARNET_EXTRANJERIA : TipoDocumento.DNI;
}

export function isValidOtpFormat(value: string): boolean {
  return OTP_DIGITS.test(value.trim());
}
