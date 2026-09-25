import { NextResponse } from "next/server";

// DATABASE_ENABLED=false runs the bot with message reactivity only: the ORM is
// never constructed and nothing is persisted. Each citizen's conversation state
// and the redelivery check live in this process's memory instead (see
// lib/fsm/session/memory-session-store.ts and lib/whatsapp/webhook/inbound-dedupe.ts),
// which is only correct with ONE running instance. Any other value (or none)
// keeps the database, as before. Read on every call so tests can flip it.
export function isDatabaseEnabled(): boolean {
  return process.env.DATABASE_ENABLED !== "false";
}

// What the web inbox API answers when there is no database to read from.
export function persistenceDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "persistence disabled" }, { status: 503 });
}
