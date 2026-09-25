export const MAX_FIRST_MESSAGE_LENGTH = 300;

export const FIRST_MESSAGE_REJECTION_TEXT =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y registro de reclamos. Por favor elija una opción: [1] Citas [2] Reclamos.";

export const MEDIA_WITHOUT_SESSION_TEXT =
  "Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.";

export type PayloadVerdict =
  | { kind: "ok" }
  | { kind: "rejected"; reason: RejectReason; reply: string };

export type RejectReason = "too_long" | "link" | "media" | "repeat";

const MEDIA_TYPES = new Set(["image", "sticker", "audio", "video", "document"]);

const LINK_MARKERS = /(?:https?:\/\/|\bwww\.|\bwa\.me\b|\bt\.me\b|\bbit\.ly\b|\btinyurl\.com\b)/i;
const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|xyz|io|me|co|pe|gob\.pe|edu\.pe)\b/i;

const REPEATED_CHARACTER = /(\S)\1{9,}/u;
const MIN_EMOJIS_WITHOUT_WORDS = 6;
const PICTOGRAPH = /\p{Extended_Pictographic}/gu;
const NOT_EMOJI_NOR_SPACE = /[^\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]/u;

function isRepetitionSpam(body: string): boolean {
  if (REPEATED_CHARACTER.test(body)) return true;

  const pictographs = body.match(PICTOGRAPH)?.length ?? 0;
  return pictographs >= MIN_EMOJIS_WITHOUT_WORDS && !NOT_EMOJI_NOR_SPACE.test(body);
}

export function checkFirstMessagePayload(message: { type: string; text?: string }): PayloadVerdict {
  if (MEDIA_TYPES.has(message.type)) {
    return { kind: "rejected", reason: "media", reply: MEDIA_WITHOUT_SESSION_TEXT };
  }

  const body = message.text ?? "";

  if ([...body].length > MAX_FIRST_MESSAGE_LENGTH) {
    return { kind: "rejected", reason: "too_long", reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  if (LINK_MARKERS.test(body) || BARE_DOMAIN.test(body)) {
    return { kind: "rejected", reason: "link", reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  if (isRepetitionSpam(body)) {
    return { kind: "rejected", reason: "repeat", reply: FIRST_MESSAGE_REJECTION_TEXT };
  }

  return { kind: "ok" };
}
