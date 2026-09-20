// Cheap, in-memory screen for the FIRST message of a conversation (no session
// yet), applied before any database work or turn lock. A first message is the
// natural entry point for spam and ads: long pastes, links, and media nobody
// asked for. Inside a running flow long text is legitimate (a complaint may be
// 1000 characters), so this never applies once a session exists.

export const MAX_FIRST_MESSAGE_LENGTH = 300;

export const FIRST_MESSAGE_REJECTION_TEXT =
  "Este es el canal oficial del *MINSA*. No podemos atender mensajes muy largos (máximo 300 caracteres) ni con enlaces. Escribe un mensaje corto, por ejemplo: *Hola*.";

export const MEDIA_WITHOUT_SESSION_TEXT =
  "Este es el canal oficial del *MINSA*. Por ahora solo podemos atenderte con mensajes de texto. Escribe *Hola* para comenzar.";

export type PayloadVerdict =
  | { kind: "ok" }
  | { kind: "rejected"; reason: "too_long" | "link" | "media"; reply: string };

const MEDIA_TYPES = new Set(["image", "sticker", "audio", "video", "document"]);

// Explicit URL schemes and well-known shorteners/messengers...
const LINK_MARKERS = /(?:https?:\/\/|\bwww\.|\bwa\.me\b|\bt\.me\b|\bbit\.ly\b|\btinyurl\.com\b)/i;
// ...and bare domains: a word, a dot, then a real top-level domain that ends the
// word ("ofertas.com", "citas.gob.pe"). ".pe" must not match "Lima.Peru".
const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|info|xyz|io|me|co|pe|gob\.pe|edu\.pe)\b/i;

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

  return { kind: "ok" };
}
