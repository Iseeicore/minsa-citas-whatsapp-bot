import { afterEach, describe, expect, it, vi } from "vitest";
import { graphApiVersion } from "@/lib/whatsapp/graph-api";

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
