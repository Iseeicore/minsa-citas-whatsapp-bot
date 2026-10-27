import { afterEach, describe, expect, it, vi } from "vitest";
import { graphApiVersion, graphMessagesUrl } from "@/lib/whatsapp/graph-api";

describe("graphApiVersion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses META_GRAPH_API_VERSION when it is set", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    expect(graphApiVersion()).toBe("v22.0");
  });

  it("falls back to v21.0 when it is unset", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", undefined as unknown as string);
    delete process.env.META_GRAPH_API_VERSION;
    expect(graphApiVersion()).toBe("v21.0");
  });

  it("falls back to v21.0 when it is set but empty, as docker compose or a copied .env.example can leave it", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "");
    expect(graphApiVersion()).toBe("v21.0");
  });
});

describe("graphMessagesUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points to the messages endpoint of the configured phone number and Graph version", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    vi.stubEnv("META_PHONE_NUMBER_ID", "synthetic-phone");
    expect(graphMessagesUrl()).toBe("https://graph.facebook.com/v22.0/synthetic-phone/messages");
  });
});
