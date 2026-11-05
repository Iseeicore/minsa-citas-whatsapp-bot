import { sendButtons, sendList, sendText } from "@/lib/fsm/core/handlers-shared";
import { findContactPhoneNumber } from "@/lib/config/contact-phone";
import { buildMenuEffect } from "@/lib/fsm/routing/flow-entry";
import { minsaDigitalUrl } from "@/lib/integrations/minsa/wire";
import { referenciaService, serviceCatalog } from "@/lib/services/service-catalog";
import type { ButtonOption, SendEffect, SessionChannel } from "@/lib/fsm/core/types";
import { SessionChannel as SessionChannelEnum } from "@/lib/enums/session-channel";
import { WEB_WELCOME_MESSAGE_TEXT, WELCOME_CITA_BUTTON, welcomeMessageText, whatsappOnlyWelcomeText } from "@/lib/constants/textos/menu";

function welcomeButtons(): ButtonOption[] {
  return referenciaService.isEnabled() ? [WELCOME_CITA_BUTTON, referenciaService.menuRow] : [WELCOME_CITA_BUTTON];
}

export function buildWelcomeEffect(channel: SessionChannel): SendEffect {
  if (channel === SessionChannelEnum.WEB) return sendList(WEB_WELCOME_MESSAGE_TEXT, serviceCatalog.menuRows(channel));

  const appUrl = minsaDigitalUrl();
  if (!appUrl) return buildMenuEffect(channel);

  return sendButtons(welcomeMessageText(appUrl), welcomeButtons());
}

export function buildWhatsappOnlyWelcome(): SendEffect {
  return sendText(whatsappOnlyWelcomeText(minsaDigitalUrl(), findContactPhoneNumber()));
}

export function buildWelcomeEffects(channel: SessionChannel): SendEffect[] {
  return [buildWelcomeEffect(channel)];
}
