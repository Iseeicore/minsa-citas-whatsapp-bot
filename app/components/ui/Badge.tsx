import type { ReactNode } from "react";

export function Badge({
  size = "sm",
  className = "",
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  const sizeClassName = size === "md" ? "px-3 py-1" : "px-1.5 py-0.5";

  return (
    <span className={`flex-shrink-0 rounded-full text-xs font-medium ${sizeClassName} ${className}`}>
      {children}
    </span>
  );
}
