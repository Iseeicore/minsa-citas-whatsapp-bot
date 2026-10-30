type Env = Record<string, string | undefined>;

export function isSandboxEnabled(env: Env = process.env): boolean {
  return env.SANDBOX_ENABLED === "true";
}
