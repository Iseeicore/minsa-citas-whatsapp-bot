import type { NextResponse } from "next/server";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";

export function toSandboxTurnFailureResponse(waId: string, error: unknown, headers: HeadersInit): NextResponse {
  if (error instanceof TurnLockTimeoutError) {
    logger.warn("turn.lock_timeout", { waId: tail(waId), layer: error.layer });
    return apiError(ApiErrorCode.BUSY, { headers });
  }
  logger.error("sandbox.turn_failed", { waId: tail(waId), error });
  return apiError(ApiErrorCode.INTERNAL, { headers });
}
