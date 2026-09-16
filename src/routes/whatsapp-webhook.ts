import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { config } from "../config.js";
import type { WebhookIngestionService } from "../services/webhook-ingestion.js";
import { toInboundConversationEvent, toInboundStatusEvents } from "../domain/inbound-conversation-event.js";
import { pushMessage } from "../services/webhook-channel-buffer.js";
import type { ConversationRepository, MessageStatus, MessageType } from "../ports/conversation-repository.js";

export interface WhatsappWebhookRoutesDeps {
  ingestion: WebhookIngestionService;
  /**
   * Postgres conversation persistence (additive): optional so every existing
   * test/call site building these deps by hand keeps compiling unchanged —
   * when omitted, this whole code path is simply skipped, same discipline as
   * `AppDeps.sender?` in app.ts.
   */
  conversationRepository?: ConversationRepository;
}

// Total, never-throwing maps from Meta's own wire strings to our closed
// port-level unions — an unsupported/future message or status type (video,
// sticker, contacts, interactive echoes, a new status Meta adds) is silently
// skipped for Postgres persistence rather than crashing the webhook; it is
// still fully handled by the existing bot pipeline / webhook-channel buffer
// above, which are untouched by any of this.
const MESSAGE_TYPE_MAP: Record<string, MessageType> = {
  text: "TEXT",
  image: "IMAGE",
  audio: "AUDIO",
  document: "DOCUMENT",
  location: "LOCATION",
};

const MESSAGE_STATUS_MAP: Record<string, MessageStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

// Thin controller: signature verification, request/response shape, delegate
// to the service. No enqueue or queue-failure logic lives here.
export function createWhatsappWebhookRoutes(deps: WhatsappWebhookRoutesDeps) {
  const { ingestion, conversationRepository } = deps;

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

      // Webhook channel viewer (no-SDD fast path, explicit user decision):
      // pushed to the (Redis-backed) buffer BEFORE ingestion.ingest() below,
      // and in its OWN try/catch, NOT tied to ingest()'s — a real citizen
      // message must reach the human viewer even when the bot's own queue
      // (a separate Redis usage) is unreachable, and conversely a hiccup on
      // THIS write must never fail the webhook response or block
      // ingestion.ingest() from still running. A message with no `from`
      // (delivery status, system event, etc.) is silently skipped, not an
      // error. Reuses the existing, already-tested mapper rather than
      // re-parsing the raw payload.
      const inboundEvent = toInboundConversationEvent(request.body);
      if (inboundEvent.from !== undefined) {
        try {
          await pushMessage({
            id: inboundEvent.eventId,
            direction: "in",
            from: inboundEvent.from,
            text: inboundEvent.text ?? `[${inboundEvent.messageType}]`,
            timestamp: inboundEvent.receivedAt,
          });
        } catch (err) {
          request.log.warn(
            { err },
            "[webhook-channel-buffer] No se pudo registrar el mensaje entrante para el visor (Redis no disponible); continúa el procesamiento normal"
          );
        }
      }

      // Postgres conversation persistence (additive): its own independent
      // try/catch, same reasoning as the webhook-channel buffer push above —
      // a Postgres hiccup must never fail the webhook response or block
      // ingestion.ingest() from still running, and conversely a down bot
      // queue must never prevent a real message from reaching the durable
      // inbox. Unsupported message/status types (MESSAGE_TYPE_MAP/
      // MESSAGE_STATUS_MAP miss) are silently skipped, not an error — same
      // total-mapping discipline as toInboundConversationEvent itself.
      if (conversationRepository !== undefined) {
        try {
          const messageType =
            inboundEvent.from !== undefined ? MESSAGE_TYPE_MAP[inboundEvent.messageType] : undefined;
          if (inboundEvent.from !== undefined && messageType !== undefined) {
            await conversationRepository.recordInboundMessage({
              waId: inboundEvent.from,
              contactName: inboundEvent.contactName,
              waMessageId: inboundEvent.eventId,
              type: messageType,
              text: inboundEvent.text,
              mediaId: inboundEvent.mediaId,
              mediaMimeType: inboundEvent.mediaMimeType,
              latitude: inboundEvent.latitude,
              longitude: inboundEvent.longitude,
              timestamp: inboundEvent.sentAt !== undefined ? new Date(inboundEvent.sentAt) : new Date(),
            });
          }

          for (const statusEvent of toInboundStatusEvents(request.body)) {
            const status = MESSAGE_STATUS_MAP[statusEvent.status];
            if (status === undefined) continue;
            await conversationRepository.updateMessageStatusByWaMessageId(statusEvent.waMessageId, status);
          }
        } catch (err) {
          request.log.warn(
            { err },
            "[conversation-repository] No se pudo registrar en Postgres (no disponible); continúa el procesamiento normal"
          );
        }
      }

      // D9: no try/catch here — a DAO/queue failure (or any other rejection
      // from ingest()) propagates to Fastify's centralized error handler
      // (src/error-handler.ts), which owns both the log line and the status
      // code. POST enqueue success stays 200 per the explicit user decision
      // recorded in the spec (revision 4) — not 201/202. Unchanged: Meta
      // still sees a non-200 and retries delivery when the queue is down,
      // exactly as before this file's webhook-channel addition.
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
