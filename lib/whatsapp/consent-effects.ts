import { findTerminosUrl } from "@/lib/config/terminos";
import { sendButtons, sendCtaUrl } from "@/lib/fsm/core/handlers-shared";
import { logger } from "@/lib/observability/logger";
import type { ChannelSendEffect, SendConsentEffect, SendEffect } from "@/lib/fsm/core/types";
import { TERMINOS_TITULO_TEXT, TERMINOS_VER_BUTTON_TEXT } from "@/lib/constants/textos/terminos";
import { SendType } from "@/lib/enums/send-type";

function terminosLink(): ChannelSendEffect[] {
  const url = findTerminosUrl();
  if (!url) {
    logger.warn("terminos.url_missing");
    return [];
  }
  return [sendCtaUrl(TERMINOS_TITULO_TEXT, TERMINOS_VER_BUTTON_TEXT, url)];
}

function toConsentMessages(effect: SendConsentEffect): ChannelSendEffect[] {
  const question = sendButtons(effect.whatsappText, effect.buttons);
  if (!effect.withTerminosLink) return [question];
  return [...terminosLink(), question];
}

export function toWhatsAppEffects(effect: SendEffect): ChannelSendEffect[] {
  if (effect.kind === SendType.CONSENT) return toConsentMessages(effect);
  return [effect];
}
