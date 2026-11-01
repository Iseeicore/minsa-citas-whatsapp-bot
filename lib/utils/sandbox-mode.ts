import { SandboxMode } from "@/lib/enums/sandbox-mode";
import { SANDBOX_MODE_QUERY_PARAM } from "@/lib/constants/sandbox-mode-param";

export function initialModeFromQuery(): SandboxMode {
  if (typeof window === "undefined") return SandboxMode.REAL;
  return new URLSearchParams(window.location.search).get(SANDBOX_MODE_QUERY_PARAM) === SandboxMode.SANDBOX
    ? SandboxMode.SANDBOX
    : SandboxMode.REAL;
}
