import type { WhatsAppLimitField } from "@/lib/enums/whatsapp-limit-field";
import type { WhatsAppLimitRule } from "@/lib/enums/whatsapp-limit-rule";

export type WhatsAppLimitViolation = {
  field: WhatsAppLimitField;
  rule: WhatsAppLimitRule;
  index?: number;
  actual: number;
  limit: number;
};
