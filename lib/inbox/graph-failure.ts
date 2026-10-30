import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { HTTP_SERVER_ERROR_MIN, HTTP_TOO_MANY_REQUESTS } from "@/lib/constants/http-status";

export type GraphSendBody = {
  messages?: Array<{ id?: string }>;
  error?: { code?: number; message?: string };
};

export function graphFailureErrorCode(status: number): ApiErrorCode.WHATSAPP_REJECTED | ApiErrorCode.WHATSAPP_UNAVAILABLE {
  if (status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_MIN) return ApiErrorCode.WHATSAPP_UNAVAILABLE;
  return ApiErrorCode.WHATSAPP_REJECTED;
}
