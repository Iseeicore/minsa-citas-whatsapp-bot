import type { ButtonOption, ListRow, SendEffect } from "@/lib/fsm/core/types";
import type { WhatsAppLimitViolation } from "@/lib/types/whatsapp-limit.types";
import { SendType } from "@/lib/enums/send-type";
import { WhatsAppLimitField } from "@/lib/enums/whatsapp-limit-field";
import { WhatsAppLimitRule } from "@/lib/enums/whatsapp-limit-rule";
import { whatsappListRows } from "@/lib/utils/whatsapp-list-rows";
import { LIST_OPEN_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { TERMINOS_TITULO_TEXT, TERMINOS_VER_BUTTON_TEXT } from "@/lib/constants/textos/terminos";
import {
  BUTTON_TITLE_MAX,
  WHATSAPP_BUTTON_ID_MAX,
  WHATSAPP_CTA_DISPLAY_TEXT_MAX,
  WHATSAPP_INTERACTIVE_BODY_MAX,
  WHATSAPP_LIST_BUTTON_LABEL_MAX,
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_LIST_MIN_ROWS,
  WHATSAPP_MAX_BUTTONS,
  WHATSAPP_MIN_BUTTONS,
  WHATSAPP_ROW_DESCRIPTION_MAX,
  WHATSAPP_ROW_ID_MAX,
  WHATSAPP_ROW_TITLE_MAX,
  WHATSAPP_TEXT_BODY_MAX,
} from "@/lib/constants/limits/whatsapp";

function lengthViolations(field: WhatsAppLimitField, text: string, limit: number, index?: number): WhatsAppLimitViolation[] {
  if (text.length <= limit) return [];
  return [{ field, rule: WhatsAppLimitRule.MAX_LENGTH, ...(index === undefined ? {} : { index }), actual: text.length, limit }];
}

function countViolations(field: WhatsAppLimitField, count: number, min: number, max: number): WhatsAppLimitViolation[] {
  if (count < min) return [{ field, rule: WhatsAppLimitRule.MIN_COUNT, actual: count, limit: min }];
  if (count > max) return [{ field, rule: WhatsAppLimitRule.MAX_COUNT, actual: count, limit: max }];
  return [];
}

function duplicateViolations(field: WhatsAppLimitField, values: string[]): WhatsAppLimitViolation[] {
  return values.flatMap((value, index) =>
    values.indexOf(value) < index
      ? [{ field, rule: WhatsAppLimitRule.UNIQUE, index, actual: values.filter((other) => other === value).length, limit: 1 }]
      : [],
  );
}

function buttonViolations(buttons: ButtonOption[]): WhatsAppLimitViolation[] {
  return [
    ...countViolations(WhatsAppLimitField.BUTTON_COUNT, buttons.length, WHATSAPP_MIN_BUTTONS, WHATSAPP_MAX_BUTTONS),
    ...buttons.flatMap((button, index) => [
      ...lengthViolations(WhatsAppLimitField.BUTTON_TITLE, button.title, BUTTON_TITLE_MAX, index),
      ...lengthViolations(WhatsAppLimitField.BUTTON_ID, button.id, WHATSAPP_BUTTON_ID_MAX, index),
    ]),
    ...duplicateViolations(
      WhatsAppLimitField.BUTTON_TITLE,
      buttons.map((button) => button.title),
    ),
  ];
}

function rowViolations(rows: ListRow[]): WhatsAppLimitViolation[] {
  return [
    ...countViolations(WhatsAppLimitField.ROW_COUNT, rows.length, WHATSAPP_LIST_MIN_ROWS, WHATSAPP_LIST_MAX_ROWS),
    ...rows.flatMap((row, index) => [
      ...lengthViolations(WhatsAppLimitField.ROW_TITLE, row.title, WHATSAPP_ROW_TITLE_MAX, index),
      ...lengthViolations(WhatsAppLimitField.ROW_DESCRIPTION, row.description ?? "", WHATSAPP_ROW_DESCRIPTION_MAX, index),
      ...lengthViolations(WhatsAppLimitField.ROW_ID, row.id, WHATSAPP_ROW_ID_MAX, index),
    ]),
    ...duplicateViolations(
      WhatsAppLimitField.ROW_ID,
      rows.map((row) => row.id),
    ),
    ...lengthViolations(WhatsAppLimitField.LIST_BUTTON_LABEL, LIST_OPEN_BUTTON_TEXT, WHATSAPP_LIST_BUTTON_LABEL_MAX),
  ];
}

const interactiveBodyViolations = (text: string): WhatsAppLimitViolation[] =>
  lengthViolations(WhatsAppLimitField.BODY_TEXT, text, WHATSAPP_INTERACTIVE_BODY_MAX);

const terminosLinkViolations = (): WhatsAppLimitViolation[] => [
  ...interactiveBodyViolations(TERMINOS_TITULO_TEXT),
  ...lengthViolations(WhatsAppLimitField.CTA_DISPLAY_TEXT, TERMINOS_VER_BUTTON_TEXT, WHATSAPP_CTA_DISPLAY_TEXT_MAX),
];

export function findLimitViolations(effect: SendEffect): WhatsAppLimitViolation[] {
  switch (effect.kind) {
    case SendType.TEXT:
      return lengthViolations(WhatsAppLimitField.BODY_TEXT, effect.text, WHATSAPP_TEXT_BODY_MAX);
    case SendType.BUTTONS:
      return [...interactiveBodyViolations(effect.text), ...buttonViolations(effect.buttons)];
    case SendType.INTERACTIVE_LIST:
      return [...interactiveBodyViolations(effect.text), ...rowViolations(whatsappListRows(effect))];
    case SendType.CTA_URL:
      return [
        ...interactiveBodyViolations(effect.text),
        ...lengthViolations(WhatsAppLimitField.CTA_DISPLAY_TEXT, effect.buttonText, WHATSAPP_CTA_DISPLAY_TEXT_MAX),
      ];
    case SendType.CONSENT:
      return [
        ...(effect.withTerminosLink ? terminosLinkViolations() : []),
        ...interactiveBodyViolations(effect.whatsappText),
        ...buttonViolations(effect.buttons),
      ];
  }
}
