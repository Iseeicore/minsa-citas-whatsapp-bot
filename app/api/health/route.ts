import { NextResponse } from "next/server";
import { isDatabaseEnabled } from "@/lib/db/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", database: isDatabaseEnabled() ? "enabled" : "disabled" });
}
