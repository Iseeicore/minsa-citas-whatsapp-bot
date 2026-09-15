// Dev-only sandbox route (design D34/D35/D36/D38/D39, spec SBX-1): a thin
// Fastify plugin (same shape as whatsapp-webhook.ts) exposing
// POST /sandbox/events INSIDE the gate-on buildApp composition. It validates
// the body (D38: 400 before any session I/O), constructs the
// InboundConversationEvent directly (D34 — never toInboundConversationEvent),
// injects it into the REAL conversationFlow.process(), then drains this
// turn's captured sends and reads the persisted session back (D35/D36/D39).
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import type { ConversationFlowService } from "../services/conversation-flow.js";
import type { SessionStore } from "../ports/session-store.js";
import type { SandboxCaptures } from "../fakes/sandbox-fakes.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";

export interface SandboxRoutesDeps {
  flow: ConversationFlowService;
  sessionStore: SessionStore;
  captures: SandboxCaptures;
}

/** SBX-1: the only message types the sandbox accepts. */
const SANDBOX_MESSAGE_TYPES = ["text", "button", "list", "image"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSandboxRoutes(deps: SandboxRoutesDeps) {
  const { flow, sessionStore, captures } = deps;

  return async function sandboxEventsRoutes(app: FastifyInstance) {
    app.post("/sandbox/events", async (request, reply) => {
      // D38: validate BEFORE any session storage load/delete or process() —
      // a 400 must guarantee no session is created or modified.
      const body = request.body as unknown;
      if (!isPlainObject(body)) {
        return reply.status(400).send({ error: "invalid_request" });
      }

      const from = body.from;
      const type = body.type;
      if (typeof from !== "string" || from.trim() === "") {
        return reply.status(400).send({ error: "invalid_request" });
      }
      if (
        typeof type !== "string" ||
        !(SANDBOX_MESSAGE_TYPES as readonly string[]).includes(type)
      ) {
        return reply.status(400).send({ error: "invalid_request" });
      }

      // D34: direct construction from the sandbox body. Unknown extra fields
      // are ignored (forward-compat); `raw` keeps the verbatim parsed body.
      const text = body.text;
      const listId = body.listId;
      const mediaId = body.mediaId;
      const mediaMimeType = body.mediaMimeType;
      const event: InboundConversationEvent = {
        eventId: crypto.randomUUID(),
        receivedAt: new Date().toISOString(),
        source: "whatsapp",
        from,
        messageType: type,
        text: typeof text === "string" ? text : undefined,
        interactiveReplyId: typeof listId === "string" ? listId : undefined,
        mediaId: typeof mediaId === "string" ? mediaId : undefined,
        // SBX-1: mediaMimeType defaults to "image/jpeg" when mediaId present.
        mediaMimeType:
          typeof mediaMimeType === "string"
            ? mediaMimeType
            : typeof mediaId === "string"
              ? "image/jpeg"
              : undefined,
        raw: body,
      };

      const sessionKey = msisdnDigest(from, config.sessionKeySecret);

      if (body.reset === true) {
        await sessionStore.delete(sessionKey);
      }

      await flow.process(event);

      // D36: snapshot-and-remove AFTER process() resolves (a re-entry turn
      // accumulates sends across both passes — drain returns them all, in
      // emission order, and only for this recipient). `from` is the validated
      // request field event.from carries verbatim (D34).
      const sent = captures.drain(from);

      // D35/D39: read the persisted session back and project the public
      // shape. process() always persists, so a null here is a composition
      // bug — surfaced as 500 through the centralized error handler.
      const session = await sessionStore.load(sessionKey);
      if (session === null) {
        throw new Error("[sandbox] session read-back returned null after process()");
      }

      return reply.status(200).send({
        sent,
        session: {
          state: session.state,
          slots: session.slots,
          counters: session.counters,
        },
      });
    });
  };
}