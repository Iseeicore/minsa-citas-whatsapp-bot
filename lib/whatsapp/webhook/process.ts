import { prisma } from "@/lib/db/prisma";
import { isDatabaseEnabled } from "@/lib/db/persistence";
import { ACTOR_EXTERNO_META, actorCiudadano, declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { withTurnLock } from "@/lib/fsm/session/turn-lock";
import { sessionRowExists } from "@/lib/fsm/session/session-store";
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

async function processInboundMessage(message: WhatsAppMessage, contact: WhatsAppContact | undefined): Promise<void> {
  if (!isDatabaseEnabled()) {
    if (!inboundDedupe.claim(message.id)) return;
    await withTurnLock(message.from_user_id, () => answerMessage(message, null));
    return;
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

  if (!(await claimInboundMessage(message, usuario.id, { content, mediaId, timestamp }))) return;

  await withTurnLock(message.from_user_id, () => answerMessage(message, usuario.id));
}

export async function processValue(value: WhatsAppValue) {
  const contactsByWaId = new Map<string, WhatsAppContact>();
  for (const contact of value.contacts ?? []) {
    contactsByWaId.set(contact.user_id, contact);
  }

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
      await processInboundMessage(message, contactsByWaId.get(message.from_user_id));
    } catch (error) {
      await answerFailure(message.from_user_id, error);
    }
  }

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
