// Postgres-backed conversation inbox (additive) — separate concern from
// webhook-channel.ts's Redis-backed capped viewer (which stays as-is) and
// from the automated bot pipeline. Reuses that same shared-secret header
// convention (config.webhookChannelSecret) for protection rather than
// inventing a second secret: both are internal ops tools with the same
// threat model (a real-send endpoint that must not be open on a public URL).
import type { FastifyInstance } from "fastify";
import type { ConversationRepository } from "../ports/conversation-repository.js";
import type { WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";

export interface ConversationRoutesDeps {
  conversationRepository: ConversationRepository;
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

export function createConversationRoutes(deps: ConversationRoutesDeps) {
  const { conversationRepository, sender, secret } = deps;

  return async function conversationRoutes(app: FastifyInstance) {
    app.get("/api/conversations", async (request, reply) => {
      if (!isAuthorized(request, secret)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      return reply.status(200).send({ conversations: await conversationRepository.listConversations() });
    });

    app.get<{ Params: { id: string } }>("/api/conversations/:id/messages", async (request, reply) => {
      if (!isAuthorized(request, secret)) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const { id } = request.params;
      return reply.status(200).send({ messages: await conversationRepository.listMessages(id) });
    });

    app.post("/api/messages/send", async (request, reply) => {
      if (!isAuthorized(request, secret)) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as unknown;
      if (!isPlainObject(body) || typeof body.waId !== "string" || typeof body.text !== "string") {
        return reply.status(400).send({ error: "invalid_request" });
      }
      const waId = body.waId.trim();
      const text = body.text.trim();
      if (waId === "" || text === "") {
        return reply.status(400).send({ error: "invalid_request" });
      }

      // Enforced BEFORE calling the Graph API — WhatsApp's 24h customer-
      // service window; outside it, free-form text is rejected by Meta
      // anyway, but checking here gives the UI a clear, specific reason
      // instead of a generic Graph API error.
      const withinWindow = await conversationRepository.isWithin24HourWindow(waId);
      if (!withinWindow) {
        return reply.status(409).send({ error: "outside_24h_window" });
      }

      // No try/catch — a Graph API failure (TransientFailureError) propagates
      // to the centralized error handler, same discipline as every other
      // sender.* call site in this codebase.
      await sender.sendText(waId, text);

      // The Graph API's real response carries the new message's wamid
      // (messages[0].id) for status correlation — WhatsappOutboundSender's
      // sendText() does not surface it today (fire-and-forget port, used
      // elsewhere without needing it). Recording without a waMessageId is
      // still correct — just not correlatable to a later `statuses` event —
      // flagged here rather than silently pretended away.
      const { conversationId, messageId } = await conversationRepository.recordOutboundMessage({
        waId,
        text,
        timestamp: new Date(),
      });

      return reply.status(200).send({ conversationId, messageId });
    });
  };
}
