import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

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

// Guard against re-instantiating the client on every hot reload in dev.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
