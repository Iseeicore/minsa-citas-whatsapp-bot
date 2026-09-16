// Webhook channel viewer (no-SDD fast path, explicit user decision): lets a
// human see real inbound WhatsApp messages and reply manually from a
// frontend viewer. Deliberately simple — no persistence, no BullMQ, no
// handover with the bot pipeline (see webhook-channel-buffer.ts's own
// header comment for the accepted trade-offs). Registered ALWAYS in
// production (unlike /sandbox/events' D33 gate): this is meant to work
// against real Meta traffic, not a fake harness — its only protection is
// the shared secret checked below.
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import { getMessages, pushMessage } from "../services/webhook-channel-buffer.js";

export interface WebhookChannelRoutesDeps {
  sender: WhatsappOutboundSender;
  secret: string;
}

const SECRET_HEADER = "x-webhook-channel-secret";

function isAuthorized(request: { headers: Record<string, unknown> }, secret: string): boolean {
  const provided = request.headers[SECRET_HEADER];
  return typeof provided === "string" && provided === secret;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createWebhookChannelRoutes(deps: WebhookChannelRoutesDeps) {
  const { sender, secret } = deps;

  return async function webhookChannelRoutes(app: FastifyInstance) {
    app.get("/api/webhook-channel/messages", async (request, reply) => {
      if (!isAuthorized(request, secret)) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      return reply.status(200).send({ messages: getMessages() });
    });

    app.post("/api/webhook-channel/messages", async (request, reply) => {
      if (!isAuthorized(request, secret)) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as unknown;
      if (!isPlainObject(body) || typeof body.to !== "string" || typeof body.body !== "string") {
        return reply.status(400).send({ error: "invalid_request" });
      }
      const to = body.to.trim();
      const text = body.body.trim();
      if (to === "" || text === "") {
        return reply.status(400).send({ error: "invalid_request" });
      }

      // No try/catch — a Graph API failure (TransientFailureError) propagates
      // to the centralized error handler, same discipline as the real
      // webhook route's ingestion.ingest() call.
      await sender.sendText(to, text);

      const message = {
        id: crypto.randomUUID(),
        direction: "out" as const,
        to,
        text,
        timestamp: new Date().toISOString(),
      };
      pushMessage(message);

      return reply.status(200).send({ message });
    });
  };
}
