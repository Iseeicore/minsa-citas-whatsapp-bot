import type { ChatEntry, SessionSnapshot } from "@/app/components/sandbox-chat/types";

export const FROM_STORAGE_KEY = "sandbox-from";
export const ENTRIES_STORAGE_KEY = "sandbox-entries";
export const SESSION_STORAGE_KEY = "sandbox-session";

export function getOrCreateFrom(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(FROM_STORAGE_KEY);
    if (stored) return stored;

    const created = `sandbox-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(FROM_STORAGE_KEY, created);
    return created;
  } catch {
    return `sandbox-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function readStoredEntries(): ChatEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(ENTRIES_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as ChatEntry[]) : [];
  } catch {
    return [];
  }
}

export function readStoredSession(): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as SessionSnapshot) : null;
  } catch {
    return null;
  }
}
