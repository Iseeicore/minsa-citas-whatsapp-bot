export const FROM_STORAGE_KEY = "sandbox-from";
export const LEGACY_STORAGE_KEYS = ["sandbox-entries", "sandbox-session"] as const;

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
