import { sendCtaUrl, sendList } from "@/lib/fsm/core/handlers-shared";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { minsaDigitalUrl } from "@/lib/integrations/minsa/wire";
import { serviceCatalog } from "@/lib/services/service-catalog";
import type { SendEffect, SessionChannel } from "@/lib/fsm/core/types";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";
import { WELCOME_MESSAGE_TEXT, WEB_WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT } from "@/lib/constants/textos/menu";

export function buildWelcomeEffect(channel: SessionChannel): SendEffect {
  if (channel === SessionChannelEnum.WEB) return sendList(WEB_WELCOME_MESSAGE_TEXT, serviceCatalog.menuRows(channel));

  const appUrl = minsaDigitalUrl();
  if (!appUrl) return buildMenuEffect(channel);

  return sendCtaUrl(WELCOME_MESSAGE_TEXT, WELCOME_CTA_BUTTON_TEXT, appUrl);
}

export function buildWelcomeEffects(channel: SessionChannel): SendEffect[] {
  return [buildWelcomeEffect(channel)];
}
