import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { config } from "../config.js";
import type { WebhookIngestionService } from "../services/webhook-ingestion.js";

export interface WhatsappWebhookRoutesDeps {
  ingestion: WebhookIngestionService;
}

// Thin controller: signature verification, request/response shape, delegate
// to the service. No enqueue or queue-failure logic lives here.
export function createWhatsappWebhookRoutes(deps: WhatsappWebhookRoutesDeps) {
  const { ingestion } = deps;

  return async function whatsappWebhookRoutes(app: FastifyInstance) {
    // Handshake de verificación: Meta lo llama al configurar/guardar el webhook.
    app.get("/webhook/whatsapp", async (request, reply) => {
      const query = request.query as Record<string, string>;
      const mode = query["hub.mode"];
      const token = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      if (mode === "subscribe" && token === config.metaWebhookVerifyToken) {
        request.log.info("Webhook verificado correctamente por Meta");
        return reply.status(200).send(challenge);
      }

      request.log.warn(
        { mode, tokenMatched: token === config.metaWebhookVerifyToken },
        "Intento de verificación de webhook rechazado"
      );
      return reply.status(403).send();
    });

    // Eventos entrantes: mensajes, estados de entrega, etc.
    app.post("/webhook/whatsapp", async (request, reply) => {
      const signatureHeader = request.headers["x-hub-signature-256"] as string | undefined;

      if (!signatureHeader || !request.rawBody || !verifySignature(request.rawBody, signatureHeader)) {
        request.log.warn("Firma de webhook inválida o ausente — evento descartado");
        return reply.status(401).send();
      }

      try {
        await ingestion.ingest(request.body);
      } catch (err) {
        // Moved from the module-level logger to request.log (D-data-flow): this
        // line now carries reqId and correlates with the error handler's output.
        request.log.error(
          { err, event: "inbound-event" },
          "No se pudo encolar el evento entrante — Meta reintentará por el 503"
        );
        return reply.status(503).send();
      }

      return reply.status(200).send();
    });
  };
}

export function verifySignature(rawBody: Buffer, signatureHeader: string): boolean {
  const expected =
    "sha256=" + crypto.createHmac("sha256", config.metaAppSecret).update(rawBody).digest("hex");

  const receivedBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);

  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}
