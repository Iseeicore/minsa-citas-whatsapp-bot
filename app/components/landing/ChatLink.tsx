import type { ComponentProps } from "react";
import { AnchorLink } from "@/app/components/ui/AnchorLink";
import { OPEN_CHAT_ATTRIBUTE } from "@/lib/constants/chat-launcher";

export function ChatLink({
  opensChat,
  loginUrl,
  ...linkProps
}: Omit<ComponentProps<typeof AnchorLink>, "href"> & { opensChat: boolean; loginUrl: string | undefined }) {
  return <AnchorLink {...linkProps} {...(opensChat ? { href: "#chat", [OPEN_CHAT_ATTRIBUTE]: true } : { href: loginUrl })} />;
}
