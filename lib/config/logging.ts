import { isFlagEnabled } from "@/lib/utils/env-flags";

type Env = Record<string, string | undefined>;

const DEFAULT_LOG_DIR = "logs";

export function isLogToFileEnabled(env: Env = process.env): boolean {
  return isFlagEnabled(env.LOG_TO_FILE);
}

export function getLogDir(env: Env = process.env): string {
  return env.LOG_DIR || DEFAULT_LOG_DIR;
}
