import { NextResponse } from "next/server";
import { isDatabaseEnabled } from "@/lib/db/persistence";

// Liveness probe for the container HEALTHCHECK: answers from the running process
// alone and never opens a database connection, so it stays cheap and works with
// DATABASE_ENABLED=false.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", database: isDatabaseEnabled() ? "enabled" : "disabled" });
}
