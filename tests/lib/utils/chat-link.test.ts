import { describe, expect, it } from "vitest";
import { buildChatLinkProps } from "@/lib/utils/chat-link";
import { OPEN_CHAT_ATTRIBUTE, OPEN_CHAT_LINK_PROPS } from "@/lib/constants/chat-launcher";

const LOGIN_URL = "https://minsa.test/login";

describe("buildChatLinkProps", () => {
  it("opens the chat when the link leads to it", () => {
    expect(buildChatLinkProps(true, LOGIN_URL)).toBe(OPEN_CHAT_LINK_PROPS);
  });

  it("leads to the login, without the chat attribute, when the chat is not available", () => {
    const props = buildChatLinkProps(false, LOGIN_URL);

    expect(props).toEqual({ href: LOGIN_URL });
    expect(props).not.toHaveProperty(OPEN_CHAT_ATTRIBUTE);
  });
});
