import type { NextResponse } from "next/server";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

export function isDatabaseEnabled(): boolean {
  return process.env.DATABASE_ENABLED !== "false";
}

export function persistenceDisabledResponse(): NextResponse {
  return apiError(ApiErrorCode.PERSISTENCE_DISABLED);
}
