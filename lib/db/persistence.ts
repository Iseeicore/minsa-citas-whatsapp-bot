import { NextResponse } from "next/server";

export function isDatabaseEnabled(): boolean {
  return process.env.DATABASE_ENABLED !== "false";
}

export function persistenceDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "persistence disabled" }, { status: 503 });
}
