// Cheap, in-memory screen for the FIRST message of a conversation (no session
// yet), applied before any database work or turn lock. A first message is the
// natural entry point for spam and ads: long pastes, links, repetition, and media
// nobody asked for. Inside a running flow long text is legitimate (a complaint may be
// 1000 characters), so this never applies once a session exists.

export const MAX_FIRST_MESSAGE_LENGTH = 300;

// The wording of both replies is the one prescribed by the audit spreadsheet
// (Pasos 1 and 2). The [1] / [2] they offer are answered by handleFirstContact.
export const FIRST_MESSAGE_REJECTION_TEXT =
  "Mensaje no reconocido. El asistente del MINSA solo atiende solicitudes de citas médicas y registro de reclamos. Por favor elija una opción: [1] Citas [2] Reclamos.";

export const MEDIA_WITHOUT_SESSION_TEXT =
  "Hola. Para iniciar su atención con el asistente del MINSA, por favor escriba un mensaje de texto con la palabra HOLA o seleccione una opción del menú.";

export type PayloadVerdict =
  | { kind: "ok" }
  | { kind: "rejected"; reason: RejectReason; reply: string };

export type RejectReason = "too_long" | "link" | "media" | "repeat";

const MEDIA_TYPES = new Set(["image", "sticker", "audio", "video", "document"]);

// Explicit URL schemes and well-known shorteners/messengers...
const LINK_MARKERS = /(?:https?:\/\/|\bwww\.|\bwa\.me\b|\bt\.me\b|\bbit\.ly\b|\btinyurl\.com\b)/i;
// ...and bare domains: a word, a dot, then a real top-level domain that ends the
// word ("ofertas.com", "citas.gob.pe"). ".pe" must not match "Lima.Peru".
const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|xyz|io|me|co|pe|gob\.pe|edu\.pe)\b/i;

// Spam that says nothing: the same character over and over ("aaaaaaaaaa…") or a
// pile of emojis with no words ("🔥🔥🔥💰💰💰"). Ten in a row is far past any
// stretched greeting ("holaaaa"), and an emoji-only message needs six of them so
// a single 👍 or a couple of hearts still gets an answer.
// Ten in a row: the character plus nine more ({9,}).
const REPEATED_CHARACTER = /(\S)\1{9,}/u;
const MIN_EMOJIS_WITHOUT_WORDS = 6;
const PICTOGRAPH = /\p{Extended_Pictographic}/gu;
// Anything that is not an emoji, its variation selector / joiner / skin tone, or a space.
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
