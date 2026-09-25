import type { ChatEntry, SessionSnapshot } from "@/app/components/sandbox-chat/types";

export const FROM_STORAGE_KEY = "sandbox-from";
export const ENTRIES_STORAGE_KEY = "sandbox-entries";
export const SESSION_STORAGE_KEY = "sandbox-session";

export function getOrCreateFrom(): string | null {
  // Reading localStorage during SSR would throw — this component only ever
  // needs the real id once mounted in the browser, so a null placeholder is
  // used for the (never-rendered-meaningfully) server pass.
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(FROM_STORAGE_KEY);
    if (stored) return stored;

    const created = `sandbox-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(FROM_STORAGE_KEY, created);
    return created;
  } catch {
    // Private browsing / blocked storage — fall back to a per-mount id.
    return `sandbox-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// A backgrounded mobile browser tab is often fully reloaded by the OS when
// it comes back to the foreground — wiping this component's in-memory React
// state even though the server-side FSM session (keyed by `from`) is
// untouched. Restoring the last-seen transcript/session here means the
// citizen sees exactly where they left off (e.g. still being asked for
// their OTP code) instead of an empty chat with no clue what to do next.
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
