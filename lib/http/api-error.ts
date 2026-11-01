import { NextResponse } from "next/server";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { HttpStatus } from "@/lib/enums/http-status";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { textoMuyLargoText } from "@/lib/constants/textos/sandbox";

export const API_ERRORS: Record<ApiErrorCode, { status: HttpStatus; message: string }> = {
  [ApiErrorCode.INVALID_BODY]: { status: HttpStatus.BAD_REQUEST, message: "El cuerpo de la petición no es válido." },
  [ApiErrorCode.UNAUTHORIZED]: { status: HttpStatus.UNAUTHORIZED, message: "La petición no está autorizada." },
  [ApiErrorCode.FORBIDDEN]: { status: HttpStatus.FORBIDDEN, message: "La petición no tiene permiso para esta operación." },
  [ApiErrorCode.NOT_FOUND]: { status: HttpStatus.NOT_FOUND, message: "El recurso solicitado no existe." },
  [ApiErrorCode.WINDOW_EXPIRED]: {
    status: HttpStatus.UNPROCESSABLE_CONTENT,
    message: "La ventana de atención de 24 horas está cerrada. Envía una plantilla aprobada en su lugar.",
  },
  [ApiErrorCode.TEXT_TOO_LONG]: { status: HttpStatus.UNPROCESSABLE_CONTENT, message: textoMuyLargoText(SANDBOX_TEXT_MAX_LENGTH) },
  [ApiErrorCode.PERSISTENCE_DISABLED]: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: "La persistencia está desactivada en este despliegue.",
  },
  [ApiErrorCode.BUSY]: { status: HttpStatus.SERVICE_UNAVAILABLE, message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." },
  [ApiErrorCode.WHATSAPP_REJECTED]: { status: HttpStatus.BAD_GATEWAY, message: "WhatsApp rechazó el mensaje y no se envió." },
  [ApiErrorCode.WHATSAPP_UNAVAILABLE]: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: "WhatsApp no está disponible en este momento y el mensaje no se envió. Intenta de nuevo en unos minutos.",
  },
  [ApiErrorCode.INTERNAL]: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: "No pudimos procesar tu mensaje. Intenta de nuevo en unos minutos.",
  },
};

export function apiError(code: ApiErrorCode, options: { message?: string; detail?: string; headers?: HeadersInit } = {}): NextResponse {
  const { status, message } = API_ERRORS[code];
  const body = { error: code, message: options.message ?? message, ...(options.detail ? { detail: options.detail } : {}) };
  return NextResponse.json(body, { status, headers: options.headers });
}
