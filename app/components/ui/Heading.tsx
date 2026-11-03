import type { PropsWithChildren } from "react";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";
import { cn } from "@/lib/utils/cn";

const VARIANT_CLASS_NAME: Record<HeadingVariant, string> = {
  [HeadingVariant.PAGE]: "text-2xl font-bold text-sb-navy",
  [HeadingVariant.SECTION]: "text-lg font-bold text-sb-navy",
  [HeadingVariant.DIALOG]: "text-base font-bold text-sb-navy",
  [HeadingVariant.LANDING_SECTION]: "font-gotham text-xl font-bold md:text-4xl",
  [HeadingVariant.LANDING_DIALOG]: "font-gotham text-xl leading-tight font-bold md:text-3xl",
  [HeadingVariant.LIST_HEADER]: "text-xs font-semibold uppercase tracking-wide text-gray-400",
  [HeadingVariant.PANEL]: "font-semibold text-gray-700",
  [HeadingVariant.DOCUMENT]: "text-sm font-bold text-sb-navy",
};

export function Heading({
  level,
  variant,
  id,
  className,
  children,
}: PropsWithChildren<{
  level: 1 | 2 | 3 | 4 | 5 | 6;
  variant: HeadingVariant;
  id?: string;
  className?: string;
}>) {
  const Tag = `h${level}` as const;

  return (
    <Tag id={id} className={cn(VARIANT_CLASS_NAME[variant], className)}>
      {children}
    </Tag>
  );
}
