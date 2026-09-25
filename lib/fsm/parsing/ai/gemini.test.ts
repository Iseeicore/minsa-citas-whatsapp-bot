import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TIMEOUT_MS, requestGeminiJson } from "@/lib/fsm/parsing/ai/gemini";

const REQUEST = {
  operation: "test_operation",
  systemPrompt: "SYSTEM",
  userText: "USER",
  responseSchema: { type: "OBJECT" },
};

function envelope(text: unknown): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

describe("requestGeminiJson", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_MODEL", "test-model");
    vi.stubEnv("GOOGLE_CLIENT_API", "test-key");
    fetchSpy = vi.fn(async () => envelope('{"answer":42}'));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("POSTs the prompt, the user turn and the schema to the configured model", async () => {
    await requestGeminiJson(REQUEST);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent?key=test-key",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      system_instruction: { parts: [{ text: "SYSTEM" }] },
      contents: [{ role: "user", parts: [{ text: "USER" }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT" } },
    });
  });

  it("falls back to the default model when none is configured", async () => {
    vi.stubEnv("GOOGLE_AI_MODEL", undefined as unknown as string);
    delete process.env.GOOGLE_AI_MODEL;

    await requestGeminiJson(REQUEST);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/models/gemini-3.6-flash:generateContent");
  });

  it("returns the parsed JSON the model wrote in its first text part", async () => {
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({ ok: true, json: { answer: 42 } });
  });

  it("reports a thrown request with the error's name (never its message)", async () => {
    fetchSpy.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "TimeoutError" }));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({
      ok: false,
      failure: "request_failed",
      errorName: "TimeoutError",
    });
  });

  it("reports a non-2xx answer with its status and the model", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 503 }));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({
      ok: false,
      failure: "http_error",
      status: 503,
      model: "test-model",
    });
  });

  it("reports an envelope without a text part", async () => {
    fetchSpy.mockResolvedValueOnce(envelope(undefined));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({ ok: false, failure: "no_text" });
  });

  it("reports text that is not JSON, and a body that is not JSON either", async () => {
    fetchSpy.mockResolvedValueOnce(envelope("not json"));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({ ok: false, failure: "invalid_json" });

    fetchSpy.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({ ok: false, failure: "invalid_json" });

    fetchSpy.mockResolvedValueOnce(new Response("null", { status: 200 }));
    await expect(requestGeminiJson(REQUEST)).resolves.toEqual({ ok: false, failure: "invalid_json" });
  });

  it("keeps the 15 s request timeout", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(15_000);
  });
});
