import { isSandboxPageEnabled } from "@/lib/config/sandbox-page";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

/** La bandeja web no tiene autenticación: sus rutas solo responden con SANDBOX_PAGE_ENABLED=true; si no, dan 404 sin tocar la base. */
export function consoleDisabledResponse() {
  if (isSandboxPageEnabled()) return null;

  return apiError(ApiErrorCode.NOT_FOUND, { message: "La consola de conversaciones no está habilitada en este despliegue." });
}
