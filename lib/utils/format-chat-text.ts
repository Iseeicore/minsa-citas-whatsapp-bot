import { ChatIconName } from "@/lib/enums/chat-icon-name";
import { ChatTokenKind } from "@/lib/enums/chat-token-kind";
import { CHAT_FORMAT_MARK, PARAGRAPH_BREAK } from "@/lib/constants/regex/chat-format";

export type ChatToken =
  | { kind: ChatTokenKind.TEXT | ChatTokenKind.BOLD | ChatTokenKind.ITALIC; value: string }
  | { kind: ChatTokenKind.ICON; icon: ChatIconName };

export function tokenizeChatText(text: string): ChatToken[] {
  const tokens: ChatToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(CHAT_FORMAT_MARK)) {
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
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
