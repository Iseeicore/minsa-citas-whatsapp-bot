import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { isDatabaseEnabled } from "@/lib/db/persistence";

// Serverless functions can invoke this module on every cold start; plain TCP
// connections would exhaust Postgres' connection limit. The Neon adapter goes
// through Neon's pooler over a WebSocket Pool (10 connections by default), not
// HTTP: the per-citizen turn lock (lib/fsm/session/turn-lock-db.ts) needs interactive
// transactions, which the HTTP driver cannot run.
function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// Built on first use, never at import: with DATABASE_ENABLED=false nothing may
// construct the client (see lib/db/persistence.ts), so a stray use fails loudly
// instead of opening a connection.
let instance = globalForPrisma.prisma;

function getPrismaClient(): PrismaClient {
  if (!isDatabaseEnabled()) {
    throw new Error("Prisma was used while DATABASE_ENABLED=false; this code path must not touch the database");
  }
  if (!instance) {
    instance = createPrismaClient();
    // Guard against re-instantiating the client on every hot reload in dev.
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = instance;
  }
  return instance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
