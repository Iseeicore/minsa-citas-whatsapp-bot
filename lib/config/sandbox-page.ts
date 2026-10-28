type Env = Record<string, string | undefined>;

export const HEALTH_PATH = "/api/health";

export function isSandboxPageEnabled(env: Env = process.env): boolean {
  return env.SANDBOX_PAGE_ENABLED === "true";
}
