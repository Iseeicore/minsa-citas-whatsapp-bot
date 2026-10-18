import { afterEach, describe, expect, it, vi } from "vitest";
import { closePreviousConversation } from "@/app/components/sandbox-chat/browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("closePreviousConversation", () => {
  it("asks the server to close the previous conversation without waiting for it", () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    closePreviousConversation("sandbox-old");

    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "sandbox-old", type: "text", close: true }),
      keepalive: true,
    });
  });

  it("never throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

    expect(() => closePreviousConversation("sandbox-old")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
