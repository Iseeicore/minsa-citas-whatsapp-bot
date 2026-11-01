import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { HttpStatus } from "@/lib/enums/http-status";
import { isServerErrorStatus } from "@/lib/utils/http-status";

export function toGraphFailureErrorCode(status: number): ApiErrorCode.WHATSAPP_REJECTED | ApiErrorCode.WHATSAPP_UNAVAILABLE {
  if (status === HttpStatus.TOO_MANY_REQUESTS || isServerErrorStatus(status)) return ApiErrorCode.WHATSAPP_UNAVAILABLE;
  return ApiErrorCode.WHATSAPP_REJECTED;
}
