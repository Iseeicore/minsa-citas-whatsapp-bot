import { CalendarIcon } from "@/app/components/icons";
import { AnchorLink } from "@/app/components/ui/AnchorLink";

export function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <AnchorLink
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full flex-col items-center gap-0.5 rounded-xl bg-sb-navy px-4 py-3 text-center text-white shadow-sm transition-colors hover:bg-sb-navy-dark"
    >
      <span className="flex items-center gap-2 text-base font-bold">
        <CalendarIcon className="h-5 w-5" />
        {label}
      </span>
    </AnchorLink>
  );
}
