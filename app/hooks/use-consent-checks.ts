import { useState } from "react";
import { areAllChecked, toggleCheck } from "@/lib/utils/consent-checks";
import type { ConsentCheck } from "@/lib/fsm/core/types";

export function useConsentChecks(checks: readonly ConsentCheck[]) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (id: string) => setChecked((current) => toggleCheck(current, id));

  return { checked, toggle, allChecked: areAllChecked(checks, checked) };
}
