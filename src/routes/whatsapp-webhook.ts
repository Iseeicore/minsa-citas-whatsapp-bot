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

      // D9: no try/catch here — a DAO/queue failure (or any other rejection
      // from ingest()) propagates to Fastify's centralized error handler
      // (src/error-handler.ts), which owns both the log line and the status
      // code. POST enqueue success stays 200 per the explicit user decision
      // recorded in the spec (revision 4) — not 201/202.
      await ingestion.ingest(request.body);

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
