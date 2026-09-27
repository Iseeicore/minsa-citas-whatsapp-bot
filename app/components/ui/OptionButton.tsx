import type { ReactNode } from "react";

export function OptionButton({
  onClick,
  href,
  tone = "blue",
  className = "",
  children,
}: {
  onClick?: () => void;
  href?: string;
  tone?: "blue" | "green";
  className?: string;
  children: ReactNode;
}) {
  const toneClassName =
    tone === "green"
      ? "border-green-500 text-green-600 hover:bg-green-50"
      : "border-blue-500 text-blue-600 hover:bg-blue-50";

  const sharedClassName = `rounded-full border bg-white px-3 py-1 text-xs font-medium ${toneClassName} ${className}`;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={sharedClassName}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sharedClassName}>
      {children}
    </button>
  );
}

export function OptionListRow({
  onClick,
  title,
  description,
}: {
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-left text-xs text-blue-700 hover:bg-blue-100"
    >
      <div className="font-medium">{title}</div>
      {description && <div className="text-blue-500">{description}</div>}
    </button>
  );
}
