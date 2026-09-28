import { NextResponse } from "next/server";
import { checkConfig } from "@/lib/config/config-errors";
import { isDatabaseEnabled } from "@/lib/db/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = isDatabaseEnabled() ? "enabled" : "disabled";
  const issues = checkConfig();
  if (issues.length === 0) return NextResponse.json({ status: "ok", database });
  return NextResponse.json({ status: "degraded", database, config: issues.map((found) => found.code) });
}
