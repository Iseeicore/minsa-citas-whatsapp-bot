import type { ConsentCheck } from "@/lib/fsm/core/types";

export function toggleCheck(checked: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(checked);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function areAllChecked(checks: readonly ConsentCheck[], checked: ReadonlySet<string>): boolean {
  return checks.every((check) => checked.has(check.id));
}
