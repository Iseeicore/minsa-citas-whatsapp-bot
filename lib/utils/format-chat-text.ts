import { ChatIconName } from "@/lib/enums/chat-icon-name";
import { ChatTokenKind } from "@/lib/enums/chat-token-kind";

export type ChatToken =
  | { kind: ChatTokenKind.TEXT | ChatTokenKind.BOLD | ChatTokenKind.ITALIC; value: string }
  | { kind: ChatTokenKind.ICON; icon: ChatIconName };

const BOLD_SPAN = /\*([^\s*](?:[^*\n]*[^\s*])?)\*/u;
const ITALIC_SPAN = /(?<![\p{L}\p{N}_])_([^\s_](?:[^_\n]*[^\s_])?)_(?![\p{L}\p{N}_])/u;
const PERU_FLAG_EMOJI = /(\u{1F1F5}\u{1F1EA})/u;
const WARNING_EMOJI = /(\u26A0\uFE0F?)/u;

export const CHAT_FORMAT_MARK = new RegExp(
  [BOLD_SPAN, ITALIC_SPAN, PERU_FLAG_EMOJI, WARNING_EMOJI].map((mark) => mark.source).join("|"),
  "gu",
);

const PARAGRAPH_BREAK = /\n{2,}/;

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
