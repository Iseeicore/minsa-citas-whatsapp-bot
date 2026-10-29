import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { SessionChannel } from "@/lib/enums/session-channel";

export const CANAL_ORIGEN_POR_CANAL: Readonly<Record<SessionChannel, CanalOrigenId>> = {
  [SessionChannel.WHATSAPP]: CanalOrigenId.WHATSAPP,
  [SessionChannel.WEB]: CanalOrigenId.WEB,
};
