import type { ComponentProps } from "react";
import { AnchorLink } from "@/app/components/ui/AnchorLink";
import { OPEN_CHAT_ATTRIBUTE } from "@/lib/constants/chat-launcher";

export function ChatLink({
  opensChat,
  href,
  ...linkProps
}: Omit<ComponentProps<typeof AnchorLink>, "href"> & { opensChat: boolean; href: string | undefined }) {
  return <AnchorLink {...linkProps} {...(opensChat ? { href: "#chat", [OPEN_CHAT_ATTRIBUTE]: true } : { href })} />;
}
