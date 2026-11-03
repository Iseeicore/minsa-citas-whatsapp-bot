import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, getApi, postApi } from "@/lib/http/api-client";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import { ApiErrorCode } from "@/lib/enums/api-error-code";
import type { ApiState } from "@/lib/types/api-client.types";

const ERROR_TEXT = "No se pudo completar la acción.";

const recorder = <T>() => {
  const states: ApiState<T>[] = [];
  const client = createApiClient<T>(ERROR_TEXT, (state) => states.push(state));
  return { states, client };
};

const respond = (body: string, status: number) => vi.fn(async () => new Response(body, { status }));

describe("createApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get goes from LOADING to DATA and returns the data", async () => {
    const fetchMock = respond(JSON.stringify({ id: "m-1" }), 200);
    vi.stubGlobal("fetch", fetchMock);
    const { states, client } = recorder<{ id: string }>();

    const result = await client.get("/api/conversations/u-1/messages");

    expect(result).toEqual({ status: ApiRequestStatus.DATA, data: { id: "m-1" } });
    expect(states).toEqual([{ status: ApiRequestStatus.LOADING }, result]);
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/u-1/messages", undefined);
  });

  it("post sends a JSON body when there is one, and nothing else when there is not", async () => {
    const fetchMock = respond("{}", 200);
    vi.stubGlobal("fetch", fetchMock);
    const { client } = recorder();

    await client.post("/api/messages/send", { conversationId: "u-1", text: "hola" });
    await client.post("/api/conversations/u-1/close");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "u-1", text: "hola" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/conversations/u-1/close", { method: "POST" });
  });

  it("an API error uses the message of the API error body", async () => {
    vi.stubGlobal("fetch", respond(JSON.stringify({ error: ApiErrorCode.WINDOW_EXPIRED, message: "La ventana está cerrada." }), 422));
    const { states, client } = recorder();

    const result = await client.post("/api/messages/send", { text: "hola" });

    expect(result).toEqual({ status: ApiRequestStatus.ERROR, message: "La ventana está cerrada." });
    expect(states).toEqual([{ status: ApiRequestStatus.LOADING }, result]);
  });

  it.each([
    ["an error without a message", respond(JSON.stringify({ error: ApiErrorCode.NOT_FOUND }), 404)],
    ["an error that is not JSON", respond("<html>", 500)],
    ["an error without a body", respond("", 503)],
    ["a success that is not JSON", respond("<html>", 200)],
    [
      "a network failure",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    ],
  ])("%s falls back to the given text and never throws", async (_caso, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);
    const { client } = recorder();

    await expect(client.get("/api/x")).resolves.toEqual({ status: ApiRequestStatus.ERROR, message: ERROR_TEXT });
  });

  it("getApi and postApi answer without passing through a state", async () => {
    const fetchMock = respond(JSON.stringify({ id: "m-1" }), 200);
    vi.stubGlobal("fetch", fetchMock);

    await expect(getApi("/api/conversations", { failed: ERROR_TEXT })).resolves.toEqual({
      status: ApiRequestStatus.DATA,
      data: { id: "m-1" },
    });
    await expect(postApi("/api/sandbox", { from: "u-1" }, { failed: ERROR_TEXT })).resolves.toEqual({
      status: ApiRequestStatus.DATA,
      data: { id: "m-1" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "u-1" }),
    });
  });

  it.each([
    ["a network failure", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))), "Sin conexión."],
    ["a success that is not JSON", respond("<html>", 200), "Sin conexión."],
    ["an error that is not JSON", respond("<html>", 503), ERROR_TEXT],
  ])("%s uses the matching text when an unreachable text is given", async (_caso, fetchMock, message) => {
    vi.stubGlobal("fetch", fetchMock);

    await expect(postApi("/api/sandbox", {}, { failed: ERROR_TEXT, unreachable: "Sin conexión." })).resolves.toEqual({
      status: ApiRequestStatus.ERROR,
      message,
    });
  });
});
