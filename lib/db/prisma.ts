import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { isDatabaseEnabled } from "@/lib/db/persistence";

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

let instance = globalForPrisma.prisma;

function getPrismaClient(): PrismaClient {
  if (!isDatabaseEnabled()) {
    throw new Error("Prisma was used while DATABASE_ENABLED=false; this code path must not touch the database");
  }
  if (!instance) {
    instance = createPrismaClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = instance;
  }
  return instance;
}

/** Cliente creado solo al primer uso y nunca con DATABASE_ENABLED=false; el adaptador de Neon usa un pool por WebSocket. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
