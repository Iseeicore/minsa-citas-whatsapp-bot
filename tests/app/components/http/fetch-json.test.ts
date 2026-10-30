import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/app/components/http/fetch-json";
import { FetchJsonStatus } from "@/lib/enums/fetch-json-status";

const FALLBACK = "No se pudo cargar.";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("returns the data of a successful answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ id: "u-1" }]), { status: 200 })),
    );

    await expect(fetchJson<Array<{ id: string }>>("/api/conversations", FALLBACK)).resolves.toEqual({
      status: FetchJsonStatus.OK,
      data: [{ id: "u-1" }],
    });
  });

  it("reports a failed answer with the message of the standard error format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "NOT_FOUND", message: "No existe." }), { status: 404 })),
    );

    await expect(fetchJson("/api/x", FALLBACK)).resolves.toEqual({ status: FetchJsonStatus.FAILED, message: "No existe." });
  });

  it.each<[string, () => Promise<Response>]>([
    ["a failed answer without a body", async () => new Response("", { status: 503 })],
    ["a network failure", () => Promise.reject(new Error("offline"))],
    ["a successful answer that is not JSON", async () => new Response("<html>", { status: 200 })],
  ])("reports %s as a failure with the fallback message, never as empty data", async (_label, respond) => {
    vi.stubGlobal("fetch", vi.fn(respond));

    await expect(fetchJson("/api/x", FALLBACK)).resolves.toEqual({ status: FetchJsonStatus.FAILED, message: FALLBACK });
  });
});
