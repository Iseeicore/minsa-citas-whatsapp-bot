import { ChatIconName } from "@/lib/enums/chat-icon-name";
import { ChatTokenKind } from "@/lib/enums/chat-token-kind";

export type ChatToken =
  | { kind: ChatTokenKind.TEXT | ChatTokenKind.BOLD | ChatTokenKind.ITALIC; value: string }
  | { kind: ChatTokenKind.ICON; icon: ChatIconName };

const FORMAT_PATTERN =
  /\*([^\s*](?:[^*\n]*[^\s*])?)\*|(?<![\p{L}\p{N}_])_([^\s_](?:[^_\n]*[^\s_])?)_(?![\p{L}\p{N}_])|(\u{1F1F5}\u{1F1EA})|(\u26A0\uFE0F?)/gu;

/**
 * Convierte el texto que el bot escribe para WhatsApp (*negrita*, _cursiva_ y emojis sin glifo en Windows)
 * en fichas que la vista dibuja con etiquetas HTML e iconos propios.
 */
export function tokenizeChatText(text: string): ChatToken[] {
  const tokens: ChatToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(FORMAT_PATTERN)) {
    if (match.index > cursor) tokens.push({ kind: ChatTokenKind.TEXT, value: text.slice(cursor, match.index) });

    const [, bold, italic, flag] = match;
    if (bold !== undefined) tokens.push({ kind: ChatTokenKind.BOLD, value: bold });
    else if (italic !== undefined) tokens.push({ kind: ChatTokenKind.ITALIC, value: italic });
    else tokens.push({ kind: ChatTokenKind.ICON, icon: flag ? ChatIconName.PERU_FLAG : ChatIconName.WARNING });

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) tokens.push({ kind: ChatTokenKind.TEXT, value: text.slice(cursor) });
  return tokens;
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
