import { looksLikeNoise } from "@/lib/security/text-noise";
import { RejectReason } from "@/lib/enums/reject-reason";
import { BARE_DOMAIN, LINK_MARKERS, NOT_EMOJI_NOR_SPACE, PICTOGRAPH, REPEATED_CHARACTER } from "@/lib/constants/regex/security";
import {
  FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT,
  FIRST_MESSAGE_REJECTION_ONLY_CITA_TEXT,
  FIRST_MESSAGE_REJECTION_TEXT,
  FIRST_MESSAGE_REJECTION_WEB_TEXT,
  MEDIA_WITHOUT_SESSION_TEXT,
} from "@/lib/constants/textos/seguridad";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { MenuChoice } from "@/lib/enums/menu-choice";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";
import type { SessionChannel } from "@/lib/fsm/core/types";
import { PayloadVerdictKind } from "@/lib/enums/payload-verdict-kind";

export const MAX_FIRST_MESSAGE_LENGTH = 300;
export const NOISE_MIN_LENGTH = 12;

export type PayloadVerdict = { kind: PayloadVerdictKind.OK } | { kind: PayloadVerdictKind.REJECTED; reason: RejectReason; reply: string };

export type { RejectReason };

const MEDIA_TYPES = new Set(["image", "audio", "video", "document"]);

const MIN_EMOJIS_WITHOUT_WORDS = 6;

const FIRST_MESSAGE_REJECTION_WITH_INCIDENCIAS: Record<SessionChannel, string> = {
  [SessionChannelEnum.WEB]: FIRST_MESSAGE_REJECTION_WEB_TEXT,
  [SessionChannelEnum.WHATSAPP]: FIRST_MESSAGE_REJECTION_TEXT,
};

const FIRST_MESSAGE_REJECTION_WITHOUT_INCIDENCIAS: Record<SessionChannel, string> = {
  [SessionChannelEnum.WEB]: FIRST_MESSAGE_REJECTION_CITA_REFERENCIA_TEXT,
  [SessionChannelEnum.WHATSAPP]: FIRST_MESSAGE_REJECTION_ONLY_CITA_TEXT,
};

function firstMessageRejectionText(channel: SessionChannel): string {
  const byChannel = serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA)
    ? FIRST_MESSAGE_REJECTION_WITH_INCIDENCIAS
    : FIRST_MESSAGE_REJECTION_WITHOUT_INCIDENCIAS;
  return byChannel[channel];
}

function isRepetitionSpam(body: string): boolean {
  if (REPEATED_CHARACTER.test(body)) return true;

  const pictographs = body.match(PICTOGRAPH)?.length ?? 0;
  return pictographs >= MIN_EMOJIS_WITHOUT_WORDS && !NOT_EMOJI_NOR_SPACE.test(body);
}

export function checkFirstMessagePayload(
  message: { type: string; text?: string },
  channel: SessionChannel = SessionChannelEnum.WHATSAPP,
): PayloadVerdict {
  if (message.type === "sticker") {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.STICKER, reply: "" };
  }

  if (MEDIA_TYPES.has(message.type)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.MEDIA, reply: MEDIA_WITHOUT_SESSION_TEXT };
  }

  const body = message.text ?? "";

  if ([...body].length > MAX_FIRST_MESSAGE_LENGTH) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.TOO_LONG, reply: firstMessageRejectionText(channel) };
  }

  if (LINK_MARKERS.test(body) || BARE_DOMAIN.test(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.LINK, reply: firstMessageRejectionText(channel) };
  }

  if (isRepetitionSpam(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.REPEAT, reply: firstMessageRejectionText(channel) };
  }

  if (body.length >= NOISE_MIN_LENGTH && looksLikeNoise(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.NOISE, reply: "" };
  }

  return { kind: PayloadVerdictKind.OK };
}
