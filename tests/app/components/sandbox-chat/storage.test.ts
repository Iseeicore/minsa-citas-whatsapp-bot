import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRIES_STORAGE_KEY,
  FROM_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  clearStoredChat,
  getOrCreateFrom,
  takePreviousFrom,
} from "@/app/components/sandbox-chat/storage";

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

  it("returns the stored from and forgets the whole stored chat", () => {
    const storage = fakeLocalStorage({
      [FROM_STORAGE_KEY]: "sandbox-old",
      [ENTRIES_STORAGE_KEY]: "[]",
      [SESSION_STORAGE_KEY]: "{}",
    });
    vi.stubGlobal("localStorage", storage);

    expect(takePreviousFrom()).toBe("sandbox-old");
    expect(storage.data.size).toBe(0);
  });

  it("returns null when nothing was stored", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage());

    expect(takePreviousFrom()).toBeNull();
  });

  it("a fresh from is generated afterwards, different from the previous one", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage({ [FROM_STORAGE_KEY]: "sandbox-old" }));

    takePreviousFrom();
    const fresh = getOrCreateFrom();

    expect(fresh).toMatch(/^sandbox-/);
    expect(fresh).not.toBe("sandbox-old");
  });

  it("clearStoredChat still removes the three keys", () => {
    const storage = fakeLocalStorage({ [FROM_STORAGE_KEY]: "a", [ENTRIES_STORAGE_KEY]: "b", [SESSION_STORAGE_KEY]: "c" });
    vi.stubGlobal("localStorage", storage);

    clearStoredChat();

    expect(storage.data.size).toBe(0);
  });
});
