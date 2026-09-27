import { NextResponse } from "next/server";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

export const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
  [ApiErrorCode.INVALID_BODY]: { status: 400, message: "El cuerpo de la petición no es válido." },
  [ApiErrorCode.NOT_FOUND]: { status: 404, message: "El recurso solicitado no existe." },
  [ApiErrorCode.WINDOW_EXPIRED]: {
    status: 422,
    message: "La ventana de atención de 24 horas está cerrada. Envía una plantilla aprobada en su lugar.",
  },
  [ApiErrorCode.PERSISTENCE_DISABLED]: { status: 503, message: "La persistencia está desactivada en este despliegue." },
  [ApiErrorCode.BUSY]: { status: 503, message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." },
};

/** Única forma de error de la API: { error: CÓDIGO, message } con el status del catálogo; detail solo para datos técnicos. */
export function apiError(
  code: ApiErrorCode,
  options: { message?: string; detail?: string; headers?: HeadersInit } = {},
): NextResponse {
  const { status, message } = API_ERRORS[code];
  const body = { error: code, message: options.message ?? message, ...(options.detail ? { detail: options.detail } : {}) };
  return NextResponse.json(body, { status, headers: options.headers });
}
