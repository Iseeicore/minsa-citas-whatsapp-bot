import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { graphClient } from "@/lib/whatsapp/graph-client";
import { GraphResultStatus } from "@/lib/enums/graph-result-status";

const URL_BASE = "https://graph.facebook.com/v22.0";
const HEADERS = { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" };

const respond = (body: string, status: number) => vi.fn(async () => new Response(body, { status }));

describe("graphClient", () => {
  beforeEach(() => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    vi.stubEnv("META_ACCESS_TOKEN", "synthetic-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("post sends the JSON body with the Graph headers and returns the data", async () => {
    const fetchMock = respond(JSON.stringify({ messages: [{ id: "wamid.out" }] }), 200);
    vi.stubGlobal("fetch", fetchMock);

    const result = await graphClient.post<{ messages: { id: string }[] }>("/phone/messages", { hola: "mundo" });

    expect(result).toEqual({ status: GraphResultStatus.DATA, data: { messages: [{ id: "wamid.out" }] } });
    expect(fetchMock).toHaveBeenCalledWith(`${URL_BASE}/phone/messages`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ hola: "mundo" }),
    });
  });

  it("get reads with the same headers and no body", async () => {
    const fetchMock = respond(JSON.stringify({ id: "media-1" }), 200);
    vi.stubGlobal("fetch", fetchMock);

    await expect(graphClient.get<{ id: string }>("/media-1")).resolves.toEqual({ status: GraphResultStatus.DATA, data: { id: "media-1" } });
    expect(fetchMock).toHaveBeenCalledWith(`${URL_BASE}/media-1`, { method: "GET", headers: HEADERS });
  });

  it("an HTTP error is returned with its status and Graph's body, never thrown", async () => {
    const error = { error: { message: "Invalid parameter", code: 100 } };
    vi.stubGlobal("fetch", respond(JSON.stringify(error), 400));

    await expect(graphClient.post("/phone/messages", {})).resolves.toEqual({ status: GraphResultStatus.ERROR, httpStatus: 400, error });
  });

  it("a body that is not JSON is an error with a defined status", async () => {
    vi.stubGlobal("fetch", respond("<html>", 200));
    await expect(graphClient.get("/x")).resolves.toEqual({ status: GraphResultStatus.ERROR, httpStatus: 502, error: null });

    vi.stubGlobal("fetch", respond("<html>", 503));
    await expect(graphClient.get("/x")).resolves.toEqual({ status: GraphResultStatus.ERROR, httpStatus: 503, error: null });
  });

  it("a network failure is an error with a defined status, never thrown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(graphClient.post("/phone/messages", {})).resolves.toEqual({
      status: GraphResultStatus.ERROR,
      httpStatus: 502,
      error: null,
    });
  });
});
