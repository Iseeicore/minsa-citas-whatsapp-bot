import Fastify from "fastify";
import type pino from "pino";
import { config } from "./config.js";
import { errorHandler } from "./error-handler.js";
import { logger as defaultLogger } from "./logger.js";
import { createWhatsappWebhookRoutes } from "./routes/whatsapp-webhook.js";
import { selectConversationQueue } from "./composition/select-conversation-queue.js";
import { createWebhookIngestionService, type WebhookIngestionService } from "./services/webhook-ingestion.js";

export interface AppDeps {
  /** Becomes Fastify's `loggerInstance` — the shared pino root, never `logger: true`. */
  logger: pino.Logger;
  ingestion: WebhookIngestionService;
}

// Composition root for everything Fastify-owned. No module-scope side
// effects and it never calls listen() — that is what makes
// `import { buildApp } from "./app.js"` safe to use directly in tests (D1),
// unlike importing server.ts, which self-invokes main() including listen().
// No explicit FastifyInstance return annotation: Fastify's generic
// instantiation is narrowed by the concrete `loggerInstance` type passed in,
// which is incompatible with the default FastifyInstance<...FastifyBaseLogger>
// generic — letting TS infer the real return type avoids that mismatch.
export async function buildApp(deps: AppDeps) {
  const { logger, ingestion } = deps;

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

  await app.register(createWhatsappWebhookRoutes({ ingestion }));

  return app;
}

// The real production wiring, asserted by the logger-wiring integration test
// (app.logger-wiring.test.ts) so the "injected fake logger" test path cannot
// silently diverge from what actually ships. server.ts's main() constructs
// an equivalent instance itself rather than calling this directly, because
// main() also needs to retain a handle on the queue instance for graceful
// SIGTERM shutdown (queue.close()) — this function exists specifically so
// tests can prove the production logger identity without duplicating the
// server's lifecycle-management concerns.
export function buildDefaultDeps(): AppDeps {
  const queue = selectConversationQueue({ config, logger: defaultLogger });
  const ingestion = createWebhookIngestionService({ queue });
  return { logger: defaultLogger, ingestion };
}
