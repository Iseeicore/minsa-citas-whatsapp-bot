type Env = Record<string, string | undefined>;

export const SANDBOX_PATH = "/sandbox";
export const HEALTH_PATH = "/api/health";

/** Las páginas del Sandbox solo se muestran con SANDBOX_PAGE_ENABLED=true; sin definir, quedan ocultas. No afecta a POST /api/sandbox. */
export function isSandboxPageEnabled(env: Env = process.env): boolean {
  return env.SANDBOX_PAGE_ENABLED === "true";
}

export function homeDestination(env: Env = process.env): string {
  return isSandboxPageEnabled(env) ? SANDBOX_PATH : HEALTH_PATH;
}
