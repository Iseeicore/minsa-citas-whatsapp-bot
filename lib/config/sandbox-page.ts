import { isFlagEnabled } from "@/lib/utils/env-flags";

type Env = Record<string, string | undefined>;

export const HEALTH_PATH = "/api/health";

export function isSandboxPageEnabled(env: Env = process.env): boolean {
  return isFlagEnabled(env.SANDBOX_PAGE_ENABLED);
}
