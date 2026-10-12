export const BOLD_SPAN = /\*([^\s*](?:[^*\n]*[^\s*])?)\*/u;
export const ITALIC_SPAN = /(?<![\p{L}\p{N}_])_([^\s_](?:[^_\n]*[^\s_])?)_(?![\p{L}\p{N}_])/u;
export const PERU_FLAG_EMOJI = /(\u{1F1F5}\u{1F1EA})/u;
export const WARNING_EMOJI = /(\u26A0\uFE0F?)/u;

export const CHAT_FORMAT_MARK = new RegExp(
  [BOLD_SPAN, ITALIC_SPAN, PERU_FLAG_EMOJI, WARNING_EMOJI].map((mark) => mark.source).join("|"),
  "gu",
);

export const PARAGRAPH_BREAK = /\n{2,}/;

export const TARGET_PAGE_OF_TOTAL = /P[áa]gina\s+(\d+)\s+de\s+(\d+)/i;
