import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import { runTurnUnlocked } from "@/lib/fsm/executor";
import { withTurnLock } from "@/lib/fsm/turn-lock";
import { routeLexicalAction } from "@/lib/fsm/handlers";
import { isQueryEffect, withNote } from "@/lib/fsm/handlers-shared";
import { traceTurn } from "@/lib/observability/tracer";
import { saveSession, sessionRowExists } from "@/lib/fsm/session-store";
import { screenInbound } from "@/lib/security/perimeter";
import { inboundRateLimiter } from "@/lib/security/rate-limiter";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { sendAndRecordEffect, sendTypingIndicator, sendWhatsAppEffect } from "@/lib/whatsapp-send";
import { downloadWhatsAppMediaAsDataUri } from "@/lib/whatsapp-media";
import { handleFirstContact } from "@/lib/fsm/first-contact";
import type { InboundEvent, SendEffect } from "@/lib/fsm/types";

// Gives the real "escribiendo…" indicator a moment to actually show before
// each message lands, instead of the bot's replies arriving all at once.
const TYPING_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Signature validation needs Node's `crypto` module, not available on Edge.
export const runtime = "nodejs";

// A turn can now chain several real API calls (auto-selected catalog steps,
// the Gemini district fallback, typing-indicator sleeps) — set explicitly
// so this never depends on the platform's implicit default.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET ?? "")
      .update(rawBody)
      .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  // Buffers must be equal length before a constant-time compare, otherwise
  // `timingSafeEqual` throws.
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

type WhatsAppContact = {
  user_id: string;
  wa_id?: string; // present on non-migrated accounts; not sent for this WABA
  profile?: { name?: string };
};

type WhatsAppMessage = {
  id: string;
  from_user_id: string;
  from?: string; // present on non-migrated accounts; not sent for this WABA
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; filename?: string };
  location?: { latitude?: number; longitude?: number };
  interactive?: {
    button_reply?: { id: string; title?: string };
    list_reply?: { id: string; title?: string };
  };
};

type WhatsAppStatus = {
  id: string;
  status: string;
};

type WhatsAppValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppEntry = {
  changes?: { value?: WhatsAppValue }[];
};

type WhatsAppWebhookPayload = {
  entry?: WhatsAppEntry[];
};

function mapMessageType(type: string): MessageType {
  switch (type) {
    case "text":
      return MessageType.TEXT;
    case "image":
      return MessageType.IMAGE;
    case "audio":
      return MessageType.AUDIO;
    case "document":
      return MessageType.DOCUMENT;
    case "location":
      return MessageType.LOCATION;
    case "template":
      return MessageType.TEMPLATE;
    default:
      return MessageType.UNKNOWN;
  }
}

function mapStatus(status: string): MessageStatus | null {
  switch (status) {
    case "sent":
      return MessageStatus.SENT;
    case "delivered":
      return MessageStatus.DELIVERED;
    case "read":
      return MessageStatus.READ;
    case "failed":
      return MessageStatus.FAILED;
    default:
      return null;
  }
}

function extractContentAndMedia(message: WhatsAppMessage): {
  content: string | null;
  mediaUrl: string | null;
} {
  switch (message.type) {
    case "text":
      return { content: message.text?.body ?? null, mediaUrl: null };
    case "image":
      return { content: message.image?.caption ?? null, mediaUrl: message.image?.id ?? null };
    case "audio":
      return { content: null, mediaUrl: message.audio?.id ?? null };
    case "document":
      return {
        content: message.document?.filename ?? null,
        mediaUrl: message.document?.id ?? null,
      };
    case "location":
      return {
        content:
          message.location?.latitude !== undefined && message.location?.longitude !== undefined
            ? `${message.location.latitude},${message.location.longitude}`
            : null,
        mediaUrl: null,
      };
    default:
      return { content: null, mediaUrl: null };
  }
}

// Maps a real inbound WhatsApp message to the same InboundEvent shape the
// Sandbox already drives the FSM with. Returns null for message types the
// FSM doesn't consume yet (audio/document/location) — those are still
// stored above, just not fed into the bot. Images only trigger a real
// media download when the citizen is actually at the Reclamo photo step —
// anywhere else, a photo would just be ignored by the FSM anyway, so this
// avoids spending two Graph API calls for nothing.
async function toInboundEvent(
  waId: string,
  message: WhatsAppMessage,
  sessionState: string,
): Promise<InboundEvent | null> {
  if (message.type === "text") {
    return { from: waId, type: "text", text: message.text?.body };
  }

  if (message.type === "interactive") {
    if (message.interactive?.button_reply) {
      return { from: waId, type: "button", listId: message.interactive.button_reply.id };
    }
    if (message.interactive?.list_reply) {
      return { from: waId, type: "list", listId: message.interactive.list_reply.id };
    }
  }

  if (message.type === "image" && message.image?.id && sessionState === "reclamo_awaiting_foto") {
    const mediaDataUri = await downloadWhatsAppMediaAsDataUri(message.image.id);
    return {
      from: waId,
      type: "image",
      text: message.image.caption,
      mediaDataUri: mediaDataUri ?? undefined,
    };
  }

  return null;
}

// A brand-new conversation. No FSM turn runs for it, but it is traced like one
// (same traceId a re-delivery of the message would get).
async function answerFirstContact(message: WhatsAppMessage, conversationId: string): Promise<void> {
  const waId = message.from_user_id;
  const firstContactText = message.type === "text" ? message.text?.body : undefined;
  const fresh = { state: "main_menu", slots: {}, counters: {} };

  await traceTurn(
    waId,
    { type: message.type, text: firstContactText, messageId: message.id },
    fresh,
    async (trace) => {
      // An abusive very first message never gets the branded welcome: the
      // lexical guard routes it exactly like the FSM would at the main menu
      // (warning + Continuar, straight into Cita, or straight into Reclamo),
      // with zero AI calls. The session is still created so the button works.
      const verdict = firstContactText ? evaluateLexicalGuard(firstContactText) : undefined;

      // Otherwise: a citizen who already asked for a cita goes straight into the
      // Cita flow (their words seed the specialty and district); a greeting gets
      // the welcome alone; the rest get the menu. See first-contact.ts.
      const first =
        verdict && verdict.action !== "ALLOW"
          ? withNote(routeLexicalAction(fresh, verdict.action, firstContactText), {
              kind: "lexical_guard",
              level: "warn",
              detail: { action: verdict.action, state: "first_contact" },
            })
          : handleFirstContact(firstContactText);

      for (const note of first.notes ?? []) trace.note(note);
      await saveSession(waId, first.session);

      const toSend = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      trace.complete({ session: first.session, sentCount: toSend.length });

      for (const effect of toSend) {
        await sendTypingIndicator(message.id);
        await sleep(TYPING_DELAY_MS);
        await sendAndRecordEffect(conversationId, waId, effect);
      }
    },
  );
}

// Everything a citizen's message triggers — the first-contact check, the FSM
// turn AND the outbound sends — runs under that citizen's turn lock (see
// lib/fsm/turn-lock.ts), so two messages sent in quick succession are answered
// one after the other, in order, and never read a stale session. Called from
// inside withTurnLock, hence runTurnUnlocked (runTurn would wait on its own lock).
async function answerMessage(message: WhatsAppMessage, conversationId: string): Promise<void> {
  const waId = message.from_user_id;
  const existingSession = await prisma.sandboxSession.findUnique({ where: { id: waId } });

  if (!existingSession) {
    await answerFirstContact(message, conversationId);
    return;
  }

  const inboundEvent = await toInboundEvent(waId, message, existingSession.state);
  if (!inboundEvent) return;

  const { sent } = await runTurnUnlocked(waId, { ...inboundEvent, messageId: message.id });
  for (const effect of sent) {
    await sendTypingIndicator(message.id);
    await sleep(TYPING_DELAY_MS);
    await sendAndRecordEffect(conversationId, waId, effect);
  }
}

// A rejection is plain text straight to the Graph API: no conversation row, no
// outbound record, no session. If the send fails there is nothing to recover.
async function sendFixedReply(waId: string, text: string): Promise<void> {
  try {
    await sendWhatsAppEffect(waId, { kind: "send_text", text });
  } catch (error) {
    console.error("Failed to send a perimeter reply", error);
  }
}

async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  for (const message of value.messages ?? []) {
    // Perimeter first — before any database write, transaction or turn lock:
    // flooding is dropped silently (Meta already got its 200), and a first
    // message that is too long, carries links, or is unsolicited media gets a
    // fixed text reply and is never stored. See lib/security/perimeter.ts.
    const decision = await screenInbound(
      { waId: message.from_user_id, type: message.type, text: message.text?.body, messageId: message.id },
      { limiter: inboundRateLimiter, hasSession: sessionRowExists },
    );
    if (decision.action === "drop") continue;
    if (decision.action === "reject") {
      await sendFixedReply(message.from_user_id, decision.reply);
      continue;
    }

    const contact = contactsByWaId.get(message.from_user_id);
    const profileName = contact?.profile?.name;
    const phoneNumber = message.from ?? contact?.wa_id;
    const timestamp = new Date(Number(message.timestamp) * 1000);
    const { content, mediaUrl } = extractContentAndMedia(message);

    const conversation = await prisma.conversation.upsert({
      where: { waId: message.from_user_id },
      create: {
        waId: message.from_user_id,
        phoneNumber: phoneNumber ?? null,
        profileName: profileName ?? null,
        lastMessageAt: timestamp,
      },
      update: {
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(profileName ? { profileName } : {}),
        lastMessageAt: timestamp,
      },
    });

    // Checked BEFORE the upsert below so we know whether this exact
    // waMessageId was already processed — Meta retries webhook deliveries,
    // and without this the bot's reply (welcome message or a real FSM
    // turn) would fire a second time for the same inbound message.
    const alreadyProcessed = await prisma.message.findUnique({
      where: { waMessageId: message.id },
      select: { id: true },
    });

    // Meta retries webhook deliveries, so upsert by `waMessageId` keeps
    // duplicate deliveries from creating duplicate rows.
    await prisma.message.upsert({
      where: { waMessageId: message.id },
      create: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        type: mapMessageType(message.type),
        content,
        mediaUrl,
        waMessageId: message.id,
        timestamp,
      },
      update: {},
    });

    if (alreadyProcessed) continue;

    // Locked per waId: see answerMessage.
    await withTurnLock(message.from_user_id, () => answerMessage(message, conversation.id));
  }

  for (const status of value.statuses ?? []) {
    const mappedStatus = mapStatus(status.status);
    if (!mappedStatus) continue;

    await prisma.message.updateMany({
      where: { waMessageId: status.id },
      data: { status: mappedStatus },
    });
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signatureHeader)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

  // Meta expects an HTTP response within a few seconds or it considers the
  // delivery failed and retries the identical payload later (with
  // exponential backoff, for up to 7 days) — a full FSM turn (typing
  // indicators, MINSA/RENIEC/Gemini calls) routinely takes longer than that.
  // `after()` lets us acknowledge Meta immediately while the real
  // processing keeps running in the background of this same invocation
  // (bounded by maxDuration above), instead of a queue/worker we've
  // deliberately avoided elsewhere in this project.
  after(async () => {
    for (const entry of payload.entry ?? []) {
      try {
        for (const change of entry.changes ?? []) {
          if (change.value) {
            await processValue(change.value);
          }
        }
      } catch (error) {
        console.error("Failed to process webhook entry", error);
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
