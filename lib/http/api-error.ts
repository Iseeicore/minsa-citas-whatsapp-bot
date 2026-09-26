import { NextResponse } from "next/server";

export const API_ERRORS = {
  INVALID_BODY: { status: 400, message: "El cuerpo de la petición no es válido." },
  NOT_FOUND: { status: 404, message: "El recurso solicitado no existe." },
  WINDOW_EXPIRED: {
    status: 422,
    message: "La ventana de atención de 24 horas está cerrada. Envía una plantilla aprobada en su lugar.",
  },
  PERSISTENCE_DISABLED: { status: 503, message: "La persistencia está desactivada en este despliegue." },
  BUSY: { status: 503, message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." },
} as const satisfies Record<string, { status: number; message: string }>;

export type ApiErrorCode = keyof typeof API_ERRORS;

/** Única forma de error de la API: { error: CÓDIGO, message } con el status del catálogo; detail solo para datos técnicos. */
export function apiError(
  code: ApiErrorCode,
  options: { message?: string; detail?: string; headers?: HeadersInit } = {},
): NextResponse {
  const { status, message } = API_ERRORS[code];
  const body = { error: code, message: options.message ?? message, ...(options.detail ? { detail: options.detail } : {}) };
  return NextResponse.json(body, { status, headers: options.headers });
}
