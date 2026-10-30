import { SANDBOX_SESSION_ID_PREFIX } from "@/lib/constants/session-ids";

export function hasSandboxPrefix(id: string): boolean {
  return id.startsWith(SANDBOX_SESSION_ID_PREFIX);
}
