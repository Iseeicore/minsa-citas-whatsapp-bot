export const OPEN_CHAT_ATTRIBUTE = "data-open-chat";
export const OPEN_CHAT_SELECTOR = `[${OPEN_CHAT_ATTRIBUTE}]`;
export const OPEN_CHAT_HREF = "#chat";
export const OPEN_CHAT_LINK_PROPS = { href: OPEN_CHAT_HREF, [OPEN_CHAT_ATTRIBUTE]: true } as const;
