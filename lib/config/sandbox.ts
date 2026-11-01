import { isFlagEnabled } from "@/lib/utils/env-flags";

type Env = Record<string, string | undefined>;

export function isSandboxEnabled(env: Env = process.env): boolean {
  return isFlagEnabled(env.SANDBOX_ENABLED);
}
