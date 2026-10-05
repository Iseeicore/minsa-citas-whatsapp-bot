import { TipoDocumento } from "@/lib/enums/tipo-documento";

const CARNET_EXTRANJERIA_LENGTH = 9;

export function isValidDniFormat(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidDocumentoFormat(value: string): boolean {
  return /^\d{8,9}$/.test(value.trim());
}

/** El largo decide el tipo: 9 dígitos es carnet de extranjería y 8 es DNI. Se llama solo con un documento ya validado. */
export function tipoDocumentoDe(numero: string): TipoDocumento {
  return numero.trim().length === CARNET_EXTRANJERIA_LENGTH ? TipoDocumento.CARNET_EXTRANJERIA : TipoDocumento.DNI;
}

export function isValidOtpFormat(value: string): boolean {
  return /^\d{4,8}$/.test(value.trim());
}
