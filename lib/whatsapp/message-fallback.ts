import type { ChannelSendEffect, SendTextEffect } from "@/lib/fsm/core/types";
import { SendType } from "@/lib/enums/send-type";
import { truncateForRow } from "@/lib/fsm/core/handlers-shared";
import { renderWithinLength } from "@/lib/utils/fit-text";
import { bodyWithOptionLinesText, linkLineText, numberedOptionLineText } from "@/lib/constants/textos/comunes";
import { WHATSAPP_TEXT_BODY_MAX } from "@/lib/constants/limits/whatsapp";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";

const numberedLines = (titles: string[]): string[] => titles.map((title, index) => numberedOptionLineText(index + 1, title));

function optionLines(effect: ChannelSendEffect): string[] {
  switch (effect.kind) {
    case SendType.TEXT:
      return [];
    case SendType.BUTTONS:
      return [
        ...numberedLines(effect.buttons.filter((button) => button.id !== ReferenciaActionButtonId.CHANGE).map((button) => button.title)),
        ...effect.buttons.filter((button) => button.id === ReferenciaActionButtonId.CHANGE).map((button) => button.title),
      ];
    case SendType.INTERACTIVE_LIST:
      return [...numberedLines(effect.rows.map((row) => row.title)), ...(effect.actions ?? []).map((action) => action.title)];
    case SendType.CTA_URL:
      return [linkLineText(effect.buttonText, effect.url)];
  }
}

function plainText(effect: ChannelSendEffect): string {
  const lines = optionLines(effect);
  if (lines.length === 0) return effect.text;
  return renderWithinLength([effect.text], ([body]) => bodyWithOptionLinesText(body, lines), WHATSAPP_TEXT_BODY_MAX);
}

export function toNumberedTextEffect(effect: ChannelSendEffect): SendTextEffect {
  return { kind: SendType.TEXT, text: truncateForRow(plainText(effect), WHATSAPP_TEXT_BODY_MAX) };
}
