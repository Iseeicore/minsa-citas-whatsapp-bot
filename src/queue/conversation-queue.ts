import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";

interface ConversationQueue {
  mode: "redis" | "memory";
  add(name: string, data: unknown): Promise<void>;
}

const memoryBacklog: Array<{ name: string; data: unknown; receivedAt: string }> = [];

export let conversationQueue: ConversationQueue = {
  mode: "memory",
  async add(name, data) {
    memoryBacklog.push({ name, data, receivedAt: new Date().toISOString() });
    logger.info(
      { event: name, pending: memoryBacklog.length },
      "[conversation-queue:memory] evento encolado"
    );
  },
};

export async function initConversationQueue(): Promise<void> {
  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });

  try {
    await connection.connect();
    await connection.ping();
    const queue = new Queue("conversation-events", { connection });

    conversationQueue = {
      mode: "redis",
      async add(name, data) {
        await queue.add(name, data, {
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        });
      },
    };

    logger.info({ redisUrl: config.redisUrl }, "[conversation-queue] Conectado a Redis");
  } catch {
    logger.warn(
      { redisUrl: config.redisUrl },
      "[conversation-queue] No se pudo conectar a Redis. " +
        "Usando cola en memoria: sirve solo para probar el handshake y la firma del webhook en local. " +
        "Para BullMQ real: docker run -d -p 6379:6379 redis:7-alpine, y reiniciar el server."
    );
    await connection.disconnect();
  }
}
