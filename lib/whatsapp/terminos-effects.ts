import { findTerminosUrl } from "@/lib/config/terminos";
import { sendButtons, sendCtaUrl } from "@/lib/fsm/core/handlers-shared";
import { logger } from "@/lib/observability/logger";
import type { ChannelSendEffect, SendEffect, SendTerminosEffect } from "@/lib/fsm/core/types";
import { TERMINOS_TITULO_TEXT, TERMINOS_VER_BUTTON_TEXT, terminosWhatsappBodyText } from "@/lib/constants/textos/terminos";
import { SendType } from "@/lib/enums/send-type";

function toTerminosMessages(effect: SendTerminosEffect): ChannelSendEffect[] {
  const question = sendButtons(terminosWhatsappBodyText(effect.text), effect.buttons);
  const url = findTerminosUrl();
  if (!url) {
    logger.warn("terminos.url_missing");
    return [question];
  }
  return [sendCtaUrl(TERMINOS_TITULO_TEXT, TERMINOS_VER_BUTTON_TEXT, url), question];
}

export function toWhatsAppEffects(effect: SendEffect): ChannelSendEffect[] {
  if (effect.kind === SendType.TERMINOS) return toTerminosMessages(effect);
  return [effect];
}
