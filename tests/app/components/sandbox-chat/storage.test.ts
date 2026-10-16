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

describe("getOrCreateFrom", () => {
  const SANDBOX_UUID = /^sandbox-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a sandbox- plus UUID from, stores it and returns the stored one afterwards", () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);

    const created = getOrCreateFrom();

    expect(created).toMatch(SANDBOX_UUID);
    expect(storage.data.get(FROM_STORAGE_KEY)).toBe(created);
    expect(getOrCreateFrom()).toBe(created);
  });

  it("gives a different from to every new session", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
    const first = getOrCreateFrom();
    takePreviousFrom();

    expect(getOrCreateFrom()).not.toBe(first);
  });

  it("still creates a sandbox- plus UUID from when the browser storage fails", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(getOrCreateFrom()).toMatch(SANDBOX_UUID);
  });
});

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
