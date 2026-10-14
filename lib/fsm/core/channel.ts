import type { Session, SessionChannel } from "@/lib/fsm/core/types";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";

export function channelOf(session: Session, event?: { channel?: SessionChannel }): SessionChannel {
  return event?.channel ?? session.channel ?? SessionChannelEnum.WHATSAPP;
}
