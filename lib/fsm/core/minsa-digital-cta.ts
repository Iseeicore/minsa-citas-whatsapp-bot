import { sendCtaUrl, sendText } from "@/lib/fsm/core/handlers-shared";
import type { SendEffect } from "@/lib/fsm/core/types";
import { minsaDigitalUrl } from "@/lib/integrations/minsa/wire";

export function sendMinsaDigitalCta(text: string, buttonText: string, path = ""): SendEffect {
  const url = minsaDigitalUrl(path);
  return url ? sendCtaUrl(text, buttonText, url) : sendText(text);
}
