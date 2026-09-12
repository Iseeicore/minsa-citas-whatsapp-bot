import Fastify from "fastify";
import { config } from "./config.js";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook.js";
import { selectConversationQueue } from "./composition/select-conversation-queue.js";
import type { ConversationQueue } from "./ports/conversation-queue.js";
import { logger } from "./logger.js";
import { errorHandler } from "./error-handler.js";

// Transitional module-scoped binding (Phase 1 of the hexagonal-architecture
// refactor). whatsapp-webhook.ts imports this mutable binding directly,
// mirroring the pre-refactor conversation-queue.ts pattern, until Phase 2
// turns the controller into a factory that receives its ingestion service as
// a constructor argument (createWhatsappWebhookRoutes({ ingestion })). This
// is deliberate and temporary — do not treat it as a design regression.
//
// Assigning it here at module scope (not inside main(), not awaited) is safe
// because selectConversationQueue()/createRedisConversationQueue() are fully
// synchronous and never throw for the redis driver (D3): Redis being
// unreachable does not block this assignment or delay app.listen() below.
export let conversationQueue: ConversationQueue = selectConversationQueue({ config, logger });

async function main() {
  const app = Fastify({
    loggerInstance: logger,
    connectionTimeout: config.connectionTimeout,
    keepAliveTimeout: config.keepAliveTimeout,
  });

  app.setErrorHandler(errorHandler);

  // Se necesita el body crudo para validar la firma HMAC (X-Hub-Signature-256).
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(whatsappWebhookRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
