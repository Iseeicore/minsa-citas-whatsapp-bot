import type { NextResponse } from "next/server";
import { apiError } from "@/lib/http/api-error";

export function isDatabaseEnabled(): boolean {
  return process.env.DATABASE_ENABLED !== "false";
}

export function persistenceDisabledResponse(): NextResponse {
  return apiError("PERSISTENCE_DISABLED");
}
