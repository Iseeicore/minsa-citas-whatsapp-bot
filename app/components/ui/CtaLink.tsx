import { CalendarIcon } from "@/app/components/icons";

export function CtaLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full flex-col items-center gap-0.5 rounded-xl bg-sb-navy px-4 py-3 text-center text-white shadow-sm transition-colors hover:bg-sb-navy-dark"
    >
      <span className="flex items-center gap-2 text-base font-bold">
        <CalendarIcon className="h-5 w-5" />
        {label}
      </span>
      <span className="text-xs text-white/80">{hint}</span>
    </a>
  );
}
