import type { ComponentType } from "react";
import { CalendarIcon, CheckCircleIcon, LockIcon } from "@/app/components/icons";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { toneChipClassName } from "@/lib/utils/tone-chip-class-name";

const TONE_ICON: Record<ReferenciaTono, ComponentType<{ className?: string }>> = {
  [ReferenciaTono.EXITO]: CheckCircleIcon,
  [ReferenciaTono.INFO]: CalendarIcon,
  [ReferenciaTono.NEUTRO]: LockIcon,
};

export function ToneChip({ tone }: { tone: ReferenciaTono }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={toneChipClassName(tone)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
