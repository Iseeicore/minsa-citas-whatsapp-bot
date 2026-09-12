import Fastify from "fastify";
import { config } from "./config.js";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook.js";
import { initConversationQueue } from "./queue/conversation-queue.js";
import { logger } from "./logger.js";
import { errorHandler } from "./error-handler.js";

async function main() {
  await initConversationQueue();

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
