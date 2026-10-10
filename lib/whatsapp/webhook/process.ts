import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { ACTOR_EXTERNO_META, actorCiudadano, declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { withTurnLock } from "@/lib/fsm/session/turn-lock";
import { failureNoticeThrottle } from "@/lib/fsm/core/failure-notice";
import { INTERRUPTION_NOTICE_TEXT } from "@/lib/fsm/core/failure-texts";
import { findSession, sessionRowExists } from "@/lib/fsm/session/session-store";
import { screenInbound } from "@/lib/security/perimeter";
import { inboundRateLimiter } from "@/lib/security/rate-limiter";
import { PerimeterAction } from "@/lib/enums/perimeter-action";
import {
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppValue,
  mapMessageType,
  mapStatus,
  extractContentAndMedia,
} from "@/lib/whatsapp/webhook/payload";
import { answerMessage, sendFixedReply, answerFailure } from "@/lib/whatsapp/webhook/answer";
import { inboundDedupe } from "@/lib/whatsapp/webhook/inbound-dedupe";
import { createInboundCoalescer } from "@/lib/whatsapp/inbound/inbound-coalescer";
import { createPostgresInboundBuffer } from "@/lib/whatsapp/inbound/postgres-inbound-buffer";
import { resolveWindowMs } from "@/lib/whatsapp/inbound/inbound-policy";

const inboundCoalescer = createInboundCoalescer({
  buffer: createPostgresInboundBuffer(),
  runTurn: withTurnLock,
  answer: answerMessage,
  notifyStale: async (waId) => {
    if (failureNoticeThrottle.shouldNotify(waId)) await sendFixedReply(waId, INTERRUPTION_NOTICE_TEXT);
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
});

/** Un solo INSERT decide quién responde: el índice único de waMessageId (P2002) descarta la reentrega concurrente de Meta. */
async function claimInboundMessage(
  message: WhatsAppMessage,
  usuarioId: string,
  stored: { content: string | null; mediaId: string | null; timestamp: Date },
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
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}

/** Guarda el mensaje y devuelve cómo responderlo; la espera de la ventana va aparte para que los mensajes de un mismo envío se junten. */
async function stageInboundMessage(
  message: WhatsAppMessage,
  contact: WhatsAppContact | undefined,
): Promise<(() => Promise<void>) | null> {
  if (!isDatabaseEnabled()) {
    if (!inboundDedupe.claim(message.id)) return null;
    return () => withTurnLock(message.from_user_id, () => answerMessage(message, null));
  }

  const profileName = contact?.profile?.name;
  const phoneNumber = message.from ?? contact?.wa_id;
  const timestamp = new Date(Number(message.timestamp) * 1000);
  const { content, mediaId } = extractContentAndMedia(message);

  const [, usuario] = await prisma.$transaction([
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
  ]);

  if (!(await claimInboundMessage(message, usuario.id, { content, mediaId, timestamp }))) return null;

  const session = await findSession(message.from_user_id);
  const windowMs = resolveWindowMs({ state: session?.state ?? null, type: message.type });
  return () => inboundCoalescer.handle({ message, usuarioId: usuario.id, windowMs });
}

export async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

  const staged: Array<{ waId: string; respond: () => Promise<void> }> = [];

  for (const message of value.messages ?? []) {
    const decision = await screenInbound(
      { waId: message.from_user_id, type: message.type, text: message.text?.body, messageId: message.id },
      { limiter: inboundRateLimiter, hasSession: sessionRowExists },
    );
    if (decision.action === PerimeterAction.DROP) continue;
    if (decision.action === PerimeterAction.REJECT) {
      await sendFixedReply(message.from_user_id, decision.reply);
      continue;
    }

    try {
      const respond = await stageInboundMessage(message, contactsByWaId.get(message.from_user_id));
      if (respond) staged.push({ waId: message.from_user_id, respond });
    } catch (error) {
      await answerFailure(message.from_user_id, error);
    }
  }

  await Promise.all(
    staged.map(async ({ waId, respond }) => {
      try {
        await respond();
      } catch (error) {
        await answerFailure(waId, error);
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
