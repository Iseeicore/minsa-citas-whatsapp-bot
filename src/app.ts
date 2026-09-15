import Fastify from "fastify";
import type pino from "pino";
import { config } from "./config.js";
import { errorHandler } from "./error-handler.js";
import { MalformedPayloadError } from "./domain/errors.js";
import { logger as defaultLogger } from "./logger.js";
import { createWhatsappWebhookRoutes } from "./routes/whatsapp-webhook.js";
import { selectConversationEventDao } from "./composition/select-conversation-event-dao.js";
import { createWebhookIngestionService, type WebhookIngestionService } from "./services/webhook-ingestion.js";
import { createSandboxDeps, type SandboxOptions } from "./composition/create-sandbox-deps.js";
import { createSandboxRoutes } from "./routes/sandbox-events.js";

export interface AppDeps {
  /** Becomes Fastify's `loggerInstance` — the shared pino root, never `logger: true`. */
  logger: pino.Logger;
  ingestion: WebhookIngestionService;
  /**
   * D37: dev-only sandbox knobs (additive optional). Only consumed when the
   * D33 gate passes inside buildApp; the production composition never reads
   * it, so buildDefaultDeps() and server.ts stay untouched.
   */
  sandboxOptions?: SandboxOptions;
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
  // D10 row 7 fix: JSON.parse's bare SyntaxError carries no statusCode and
  // used to fall through error-handler.ts's old range check to 500. Wrapping
  // it in MalformedPayloadError makes statusFor() map it to 400, matching
  // what Fastify's own JSON parser would have raised.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text.length ? JSON.parse(text) : {});
    } catch (cause) {
      done(new MalformedPayloadError("El cuerpo de la petición no es JSON válido", { cause }) as Error, undefined);
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(createWhatsappWebhookRoutes({ ingestion }));

  // D33/SBX-6: fail-closed sandbox gate — the dev harness is composed and
  // registered ONLY when the flag is exactly "true" AND we are not in
  // production. Non-registration is the fail-closed default (Fastify 404 for
  // the unregistered route), mirroring select-session-store.ts's production
  // guard on the memory driver: a dev-only subsystem must never exist in the
  // production composition.
  if (config.sandboxEnabled === true && config.nodeEnv !== "production") {
    const sandbox = createSandboxDeps({
      config,
      logger,
      options: deps.sandboxOptions,
    });
    await app.register(createSandboxRoutes(sandbox));
  }

  return app;
}

// The real production wiring, asserted by the logger-wiring integration test
// (app.logger-wiring.test.ts) so the "injected fake logger" test path cannot
// silently diverge from what actually ships. server.ts's main() constructs
// an equivalent instance itself rather than calling this directly, because
// main() also needs to retain a handle on the DAO instance for graceful
// SIGTERM shutdown (dao.close()) — this function exists specifically so
// tests can prove the production logger identity without duplicating the
// server's lifecycle-management concerns.
export function buildDefaultDeps(): AppDeps {
  const dao = selectConversationEventDao({ config, logger: defaultLogger });
  const ingestion = createWebhookIngestionService({
    dao,
    logger: defaultLogger,
    logHashSecret: config.logHashSecret,
  });
  return { logger: defaultLogger, ingestion };
}
