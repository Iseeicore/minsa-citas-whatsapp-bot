import { OPEN_CHAT_LINK_PROPS } from "@/lib/constants/chat-launcher";

export function buildChatLinkProps(opensChat: boolean, loginUrl: string): typeof OPEN_CHAT_LINK_PROPS | { href: string } {
  if (!opensChat) return { href: loginUrl };
  return OPEN_CHAT_LINK_PROPS;
}
