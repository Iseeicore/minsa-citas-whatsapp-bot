import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiClient, REQUEST_TIMEOUT_MS, requestGeminiJson, toGeminiSchema } from "@/lib/fsm/parsing/ai/providers/gemini";

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
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "test-key" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      system_instruction: { parts: [{ text: "SYSTEM" }] },
      contents: [{ role: "user", parts: [{ text: "USER" }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT" } },
    });
  });

  it("never puts the API key in the URL, where an error message or log line could carry it", async () => {
    await requestGeminiJson(REQUEST);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).not.toContain("test-key");
    expect(new URL(url).search).toBe("");
  });

  it("falls back to the default model when none is configured", async () => {
    vi.stubEnv("GOOGLE_AI_MODEL", undefined as unknown as string);
    delete process.env.GOOGLE_AI_MODEL;

    await requestGeminiJson(REQUEST);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("/models/gemini-3.6-flash:generateContent");
  });

  it("falls back to the default model when GOOGLE_AI_MODEL is set but empty", async () => {
    vi.stubEnv("GOOGLE_AI_MODEL", "");

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

describe("toGeminiSchema", () => {
  it("upper-cases scalar, object and array types", () => {
    expect(
      toGeminiSchema({
        type: "object",
        properties: { list: { type: "array", items: { type: "number" } }, flag: { type: "boolean" } },
      }),
    ).toEqual({
      type: "OBJECT",
      properties: { list: { type: "ARRAY", items: { type: "NUMBER" } }, flag: { type: "BOOLEAN" } },
    });
  });

  it("turns a nullable JSON Schema type into Gemini's nullable flag", () => {
    expect(toGeminiSchema({ type: ["string", "null"] })).toEqual({ type: "STRING", nullable: true });
  });

  it("keeps enum values and required fields, and adds no key the source did not have", () => {
    const converted = toGeminiSchema({
      type: "object",
      properties: { intent: { type: "string", enum: ["cita", "unclear"] } },
      required: ["intent"],
    });

    expect(converted).toEqual({
      type: "OBJECT",
      properties: { intent: { type: "STRING", enum: ["cita", "unclear"] } },
      required: ["intent"],
    });
    expect(Object.keys((converted as { properties: { intent: object } }).properties.intent)).toEqual(["type", "enum"]);
  });
});

describe("createGeminiClient", () => {
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

  it("identifies itself as the gemini provider", () => {
    expect(createGeminiClient().provider).toBe("gemini");
  });

  it("sends the standard schema translated to Gemini's dialect and returns the parsed JSON", async () => {
    const outcome = await createGeminiClient().generateJson({
      operation: "test_operation",
      systemPrompt: "SYSTEM",
      userText: "USER",
      schema: { type: "object", properties: { id: { type: ["string", "null"] } }, required: ["id"] },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).generationConfig.responseSchema).toEqual({
      type: "OBJECT",
      properties: { id: { type: "STRING", nullable: true } },
      required: ["id"],
    });
    expect(outcome).toEqual({ ok: true, json: { answer: 42 } });
  });
});
