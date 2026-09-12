import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { selectConversationEventDao } from "./composition/select-conversation-event-dao.js";
import { createWebhookIngestionService } from "./services/webhook-ingestion.js";

async function main() {
  // Selecting the DAO is synchronous and never throws for the redis driver
  // (D3) — no await here, and nothing gates app.listen() below on Redis
  // readiness. Constructed directly (not via app.ts's buildDefaultDeps) so
  // this scope keeps a handle on `dao` for the graceful-shutdown drain.
  const dao = selectConversationEventDao({ config, logger });
  const ingestion = createWebhookIngestionService({ dao, logger, logHashSecret: config.logHashSecret });

  const app = await buildApp({ logger, ingestion });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Cerrando el servidor de forma ordenada");
    try {
      await app.close();
      await dao.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error durante el cierre ordenado del servidor");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during server startup");
  process.exit(1);
});
