import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { cn } from "@/lib/utils/cn";

const CHIP_SHAPE = "flex shrink-0 items-center justify-center rounded-full p-1";

const TONE_CLASS_NAME: Record<ReferenciaTono, string> = {
  [ReferenciaTono.EXITO]: "bg-estado-exito-tint text-estado-exito",
  [ReferenciaTono.INFO]: "bg-estado-info-tint text-estado-info",
  [ReferenciaTono.NEUTRO]: "bg-estado-neutro-tint text-estado-neutro",
};

export function toneChipClassName(tono: ReferenciaTono): string {
  return cn(CHIP_SHAPE, TONE_CLASS_NAME[tono]);
}
