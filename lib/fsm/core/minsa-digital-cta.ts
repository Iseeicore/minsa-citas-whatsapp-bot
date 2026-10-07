import { sendCtaUrl, sendText } from "@/lib/fsm/core/handlers-shared";
import type { SendEffect } from "@/lib/fsm/core/types";
import { minsaDigitalUrl } from "@/lib/integrations/minsa/wire";

/** Botón hacia MINSA Digital; si MINSA_DIGITAL_APP_URL falta, el mismo mensaje sale como texto en vez de un botón roto. */
export function sendMinsaDigitalCta(text: string, buttonText: string, path = ""): SendEffect {
  const url = minsaDigitalUrl(path);
  return url ? sendCtaUrl(text, buttonText, url) : sendText(text);
}
