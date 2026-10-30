import { NextResponse } from "next/server";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { textoMuyLargoText } from "@/lib/constants/textos/sandbox";

export const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
  [ApiErrorCode.INVALID_BODY]: { status: 400, message: "El cuerpo de la petición no es válido." },
  [ApiErrorCode.UNAUTHORIZED]: { status: 401, message: "La petición no está autorizada." },
  [ApiErrorCode.FORBIDDEN]: { status: 403, message: "La petición no tiene permiso para esta operación." },
  [ApiErrorCode.NOT_FOUND]: { status: 404, message: "El recurso solicitado no existe." },
  [ApiErrorCode.WINDOW_EXPIRED]: {
    status: 422,
    message: "La ventana de atención de 24 horas está cerrada. Envía una plantilla aprobada en su lugar.",
  },
  [ApiErrorCode.TEXT_TOO_LONG]: { status: 422, message: textoMuyLargoText(SANDBOX_TEXT_MAX_LENGTH) },
  [ApiErrorCode.PERSISTENCE_DISABLED]: { status: 503, message: "La persistencia está desactivada en este despliegue." },
  [ApiErrorCode.BUSY]: { status: 503, message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." },
  [ApiErrorCode.WHATSAPP_REJECTED]: { status: 502, message: "WhatsApp rechazó el mensaje y no se envió." },
  [ApiErrorCode.WHATSAPP_UNAVAILABLE]: {
    status: 503,
    message: "WhatsApp no está disponible en este momento y el mensaje no se envió. Intenta de nuevo en unos minutos.",
  },
  [ApiErrorCode.INTERNAL]: { status: 500, message: "No pudimos procesar tu mensaje. Intenta de nuevo en unos minutos." },
};

export function apiError(code: ApiErrorCode, options: { message?: string; detail?: string; headers?: HeadersInit } = {}): NextResponse {
  const { status, message } = API_ERRORS[code];
  const body = { error: code, message: options.message ?? message, ...(options.detail ? { detail: options.detail } : {}) };
  return NextResponse.json(body, { status, headers: options.headers });
}
