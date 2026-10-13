import { PrismaClient } from "@prisma/client";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { DatabaseDisabledError } from "@/lib/errors/database-disabled-error";

function createPrismaClient() {
  return new PrismaClient();
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

let instance = globalForPrisma.prisma;

function getPrismaClient(): PrismaClient {
  if (!isDatabaseEnabled()) {
    throw new DatabaseDisabledError();
  }
  if (!instance) {
    instance = createPrismaClient();
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
