import { isDatabaseEnabled } from "@/lib/db/persistence";
import { logger } from "@/lib/observability/logger";
import { createPostgresInboundBuffer } from "@/lib/whatsapp/inbound/postgres-inbound-buffer";
import { INBOUND_MAX_AGE_MS } from "@/lib/whatsapp/inbound/inbound-policy";

/** Al arrancar, vence los mensajes que quedaron pendientes por una caída: no se responden ni se avisa a nadie. */
export async function expireStaleInbound(now: () => number = Date.now): Promise<void> {
  if (!isDatabaseEnabled()) return;

  try {
    const expired = await createPostgresInboundBuffer().expireStale(new Date(now() - INBOUND_MAX_AGE_MS));
    if (expired > 0) logger.info("inbound.expired_on_boot", { expired });
  } catch (error) {
    logger.warn("inbound.expire_failed", { error });
  }
}
