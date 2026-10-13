import { looksLikeNoise } from "@/lib/security/text-noise";
import { RejectReason } from "@/lib/enums/reject-reason";
import { BARE_DOMAIN, LINK_MARKERS, NOT_EMOJI_NOR_SPACE, PICTOGRAPH, REPEATED_CHARACTER } from "@/lib/constants/regex/security";
import { FIRST_MESSAGE_REJECTION_TEXT, MEDIA_WITHOUT_SESSION_TEXT } from "@/lib/constants/textos/seguridad";
import { PayloadVerdictKind } from "@/lib/enums/payload-verdict-kind";

export const MAX_FIRST_MESSAGE_LENGTH = 300;
export const NOISE_MIN_LENGTH = 12;

export type PayloadVerdict = { kind: PayloadVerdictKind.OK } | { kind: PayloadVerdictKind.REJECTED; reason: RejectReason; reply: string };

export type { RejectReason };

const MEDIA_TYPES = new Set(["image", "audio", "video", "document"]);

const MIN_EMOJIS_WITHOUT_WORDS = 6;

function isRepetitionSpam(body: string): boolean {
  if (REPEATED_CHARACTER.test(body)) return true;

  const pictographs = body.match(PICTOGRAPH)?.length ?? 0;
  return pictographs >= MIN_EMOJIS_WITHOUT_WORDS && !NOT_EMOJI_NOR_SPACE.test(body);
}

export function checkFirstMessagePayload(message: { type: string; text?: string }): PayloadVerdict {
  if (message.type === "sticker") {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.STICKER, reply: "" };
  }

  if (MEDIA_TYPES.has(message.type)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.MEDIA, reply: MEDIA_WITHOUT_SESSION_TEXT };
  }

  const body = message.text ?? "";

  if ([...body].length > MAX_FIRST_MESSAGE_LENGTH) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.TOO_LONG, reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  if (LINK_MARKERS.test(body) || BARE_DOMAIN.test(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.LINK, reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  if (isRepetitionSpam(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.REPEAT, reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  if (body.length >= NOISE_MIN_LENGTH && looksLikeNoise(body)) {
    return { kind: PayloadVerdictKind.REJECTED, reason: RejectReason.NOISE, reply: "" };
  }

  return { kind: PayloadVerdictKind.OK };
}
