import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { ACTOR_EXTERNO_META, actorCiudadano, declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { withTurnLock } from "@/lib/fsm/session/turn-lock";
import { failureNoticeThrottle } from "@/lib/fsm/core/failure-notice";
import { findSession, sessionRowExists } from "@/lib/fsm/session/session-store";
import { screenInbound } from "@/lib/security/perimeter";
import { evidenceImageRateLimiter, inboundRateLimiter } from "@/lib/security/rate-limiter";
import { PerimeterAction } from "@/lib/enums/perimeter-action";
import {
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppValue,
  mapMessageType,
  mapStatus,
  extractContentAndMedia,
  tapReplyTo,
} from "@/lib/whatsapp/webhook/payload";
import { answerMessage, sendFixedReply, answerFailure } from "@/lib/whatsapp/webhook/answer";
import { sendTypingIndicator } from "@/lib/whatsapp/whatsapp-send";
import { createLatencyMarks, type LatencyMarks } from "@/lib/observability/inbound-latency";
import { deriveTraceId } from "@/lib/observability/tracer";
import { inboundDedupe } from "@/lib/whatsapp/webhook/inbound-dedupe";
import { processBsuidChanges } from "@/lib/whatsapp/webhook/user-id-update";
import { createInboundCoalescer } from "@/lib/whatsapp/inbound/inbound-coalescer";
import { createPostgresInboundBuffer } from "@/lib/whatsapp/inbound/postgres-inbound-buffer";
import { resolveWindowMs } from "@/lib/whatsapp/inbound/inbound-policy";
import { INTERRUPTION_NOTICE_TEXT } from "@/lib/constants/textos/fallas";
import { isObject } from "@/lib/utils/type-guards";
import { hasSandboxPrefix } from "@/lib/utils/session-ids";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";

type StagedTurn = { waId: string; messageId: string; respond: () => Promise<void>; marks: LatencyMarks };

const inboundCoalescer = createInboundCoalescer({
  buffer: createPostgresInboundBuffer(),
  runTurn: withTurnLock,
  answer: (turn, usuarioId, marks) => answerMessage(turn.message, usuarioId, marks, turn.mediaIds),
  notifyStale: async (waId) => {
    if (failureNoticeThrottle.shouldNotify(waId)) await sendFixedReply(waId, INTERRUPTION_NOTICE_TEXT);
  },
  reportFailure: answerFailure,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
});

async function claimInboundMessage(
  message: WhatsAppMessage,
  usuarioId: string,
  stored: { content: string | undefined; mediaId: string | undefined; timestamp: Date },
): Promise<boolean> {
  try {
    await prisma.$transaction([
      declararActor(actorCiudadano(message.from_user_id)),
      prisma.mensaje.create({
        data: {
          usuarioId,
          direccionMensajeId: DireccionMensajeId.ENTRANTE,
          tipoMensajeId: mapMessageType(message.type),
          contenido: stored.content,
          mediaId: stored.mediaId,
          waMessageId: message.id,
          fechaHora: stored.timestamp,
        },
      }),
    ]);
    return true;
  } catch (error) {
    if (isObject(error) && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}

async function stageInboundMessage(
  message: WhatsAppMessage,
  contact: WhatsAppContact | undefined,
  marks: LatencyMarks,
): Promise<(() => Promise<void>) | undefined> {
  if (!isDatabaseEnabled()) {
    if (!inboundDedupe.claim(message.id)) return undefined;
    marks.mark("staged");
    return () =>
      withTurnLock(message.from_user_id, () => {
        marks.mark("lock");
        return answerMessage(message, undefined, marks);
      });
  }

  const profileName = contact?.profile?.name;
  const phoneNumber = message.from ?? contact?.wa_id;
  const timestamp = new Date(Number(message.timestamp) * 1000);
  const { content, mediaId } = extractContentAndMedia(message);

  const [[, usuario], session] = await Promise.all([
    prisma.$transaction([
      declararActor(actorCiudadano(message.from_user_id)),
      prisma.usuario.upsert({
        where: { waId: message.from_user_id },
        create: {
          waId: message.from_user_id,
          phoneNumber: phoneNumber ?? null,
          profileName: profileName ?? null,
          ultimoMensajeEn: timestamp,
        },
        update: {
          ...(phoneNumber ? { phoneNumber } : {}),
          ...(profileName ? { profileName } : {}),
          ultimoMensajeEn: timestamp,
        },
      }),
    ]),
    findSession(message.from_user_id),
  ]);

  if (!(await claimInboundMessage(message, usuario.id, { content, mediaId, timestamp }))) return undefined;

  marks.mark("staged");
  const windowMs = resolveWindowMs({ state: session?.state, type: message.type });
  return () => inboundCoalescer.handle({ message, usuarioId: usuario.id, windowMs, marks });
}

async function screenAndStage(message: WhatsAppMessage, contact: WhatsAppContact | undefined): Promise<StagedTurn | undefined> {
  const marks = createLatencyMarks();
  const decision = await screenInbound(
    { waId: message.from_user_id, type: message.type, text: message.text?.body, messageId: message.id },
    {
      limiter: inboundRateLimiter,
      evidenceLimiter: evidenceImageRateLimiter,
      hasSession: sessionRowExists,
      sessionState: async (waId) => (await findSession(waId))?.state,
    },
  );
  if (decision.action === PerimeterAction.DROP) return undefined;
  if (decision.action === PerimeterAction.REJECT) {
    await sendFixedReply(message.from_user_id, decision.reply);
    return undefined;
  }
  marks.mark("perimeter");

  if (!tapReplyTo(message)) void sendTypingIndicator(message.id);

  const respond = await stageInboundMessage(message, contact, marks);
  return respond ? { waId: message.from_user_id, messageId: message.id, respond, marks } : undefined;
}

async function screenAndStageOrAnswerFailure(
  message: WhatsAppMessage,
  contact: WhatsAppContact | undefined,
): Promise<StagedTurn | undefined> {
  try {
    return await screenAndStage(message, contact);
  } catch (error) {
    await answerFailure(message.from_user_id, error);
    return undefined;
  }
}

export async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  const staged: StagedTurn[] = [];

  if (isDatabaseEnabled()) await processBsuidChanges(value);

  for (const message of value.messages ?? []) {
    if (message.type === "system") continue;
    if (hasSandboxPrefix(message.from_user_id)) {
      logger.warn("webhook.sandbox_id_dropped", { waId: tail(message.from_user_id), messageType: message.type });
      continue;
    }

    const turn = await screenAndStageOrAnswerFailure(message, contactsByWaId.get(message.from_user_id));
    if (turn) staged.push(turn);
  }

  await Promise.all(
    staged.map(async ({ waId, messageId, respond, marks }) => {
      try {
        await respond();
      } catch (error) {
        await answerFailure(waId, error);
      } finally {
        marks.finish("inbound.latency", { waId, channel: "whatsapp", traceId: deriveTraceId(waId, messageId) });
      }
    }),
  );

  if (!isDatabaseEnabled()) return;

  for (const status of value.statuses ?? []) {
    const estadoMensajeId = mapStatus(status.status);
    if (!estadoMensajeId) continue;

    await prisma.$transaction([
      declararActor(ACTOR_EXTERNO_META),
      prisma.mensaje.updateMany({
        where: { waMessageId: status.id },
        data: { estadoMensajeId },
      }),
    ]);
  }
}
