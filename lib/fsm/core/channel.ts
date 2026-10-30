import type { Session, SessionChannel } from "@/lib/fsm/core/types";
import { MissingChannelError } from "@/lib/errors/missing-channel-error";

export function channelOf(session: Session, event?: { channel: SessionChannel }): SessionChannel {
  const channel = event?.channel ?? session.channel;
  if (!channel) throw new MissingChannelError(session.state);
  return channel;
}
