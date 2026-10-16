import { SANDBOX_SESSION_ID_PREFIX } from "@/lib/constants/session-ids";
import { randomUuid } from "@/lib/utils/random-uuid";

export const FROM_STORAGE_KEY = "sandbox-from";
export const LEGACY_STORAGE_KEYS = ["sandbox-entries", "sandbox-session"] as const;

function createFrom(): string {
  return `${SANDBOX_SESSION_ID_PREFIX}${randomUuid()}`;
}

export function getOrCreateFrom(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(FROM_STORAGE_KEY);
    if (stored) return stored;

    const created = createFrom();
    localStorage.setItem(FROM_STORAGE_KEY, created);
    return created;
  } catch {
    return createFrom();
  }
}

export function clearStoredChat(): void {
  if (typeof window === "undefined") return;

  try {
    for (const key of [FROM_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) localStorage.removeItem(key);
  } catch {
  }
}

export function takePreviousFrom(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const previous = localStorage.getItem(FROM_STORAGE_KEY);
    clearStoredChat();
    return previous;
  } catch {
    return null;
  }
}
