export type SandboxMode = "real" | "sandbox";

export function initialModeFromQuery(): SandboxMode {
  if (typeof window === "undefined") return "real";
  return new URLSearchParams(window.location.search).get("panel") === "sandbox" ? "sandbox" : "real";
}
