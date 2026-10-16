import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FROM_STORAGE_KEY, LEGACY_STORAGE_KEYS, getOrCreateFrom, takePreviousFrom } from "@/app/components/sandbox-chat/storage";

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("takePreviousFrom", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stored from, purges the keys older versions used for the session and the chat, and leaves room for a fresh from", () => {
    const storage = fakeLocalStorage({
      [FROM_STORAGE_KEY]: "sandbox-old",
      ...Object.fromEntries(LEGACY_STORAGE_KEYS.map((key) => [key, "{}"])),
    });
    vi.stubGlobal("localStorage", storage);

    expect(takePreviousFrom()).toBe("sandbox-old");
    expect(storage.data.size).toBe(0);
    expect(getOrCreateFrom()).toMatch(/^sandbox-(?!old$)/);
  });

  it("returns null when nothing was stored", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage());

    expect(takePreviousFrom()).toBeNull();
  });
});
