import type { ReactNode } from "react";
import { BannerTone } from "@/lib/enums/banner-tone";
import { cn } from "@/lib/utils/cn";

const TONE_CLASS_NAME: Record<BannerTone, string> = {
  [BannerTone.ERROR]: "border-red-300 bg-red-50 text-red-800",
  [BannerTone.NOTICE]: "border-slate-300 bg-slate-100 text-slate-700",
};

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return <div className={cn("border-t px-4 py-2 text-sm", TONE_CLASS_NAME[tone])}>{children}</div>;
}
