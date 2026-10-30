import { afterEach, describe, expect, it, vi } from "vitest";
import { findGraphMediaTarget, findGraphMessagesTarget, graphApiVersion } from "@/lib/whatsapp/graph-api";
import { GraphTargetStatus } from "@/lib/enums/graph-target-status";
import { captureLogs } from "@/tests/support/capture-logs";

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

describe("findGraphMessagesTarget", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points to the messages endpoint of the configured phone number and Graph version, with the bearer token", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    vi.stubEnv("META_PHONE_NUMBER_ID", "synthetic-phone");
    vi.stubEnv("META_ACCESS_TOKEN", "synthetic-token");

    expect(findGraphMessagesTarget()).toEqual({
      status: GraphTargetStatus.READY,
      url: "https://graph.facebook.com/v22.0/synthetic-phone/messages",
      headers: { Authorization: "Bearer synthetic-token" },
    });
  });

  it.each([
    ["META_PHONE_NUMBER_ID", { META_ACCESS_TOKEN: "synthetic-token", META_PHONE_NUMBER_ID: "" }],
    ["META_ACCESS_TOKEN", { META_ACCESS_TOKEN: " ", META_PHONE_NUMBER_ID: "synthetic-phone" }],
  ])("never builds the request when %s is missing, and logs the variable without any secret", (variable, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const logs = captureLogs();

    expect(findGraphMessagesTarget()).toEqual({ status: GraphTargetStatus.MISSING_VARIABLE, variable });
    expect(logs).toContainEqual(expect.objectContaining({ level: "error", event: "whatsapp.config_missing", variable }));
    expect(JSON.stringify(logs)).not.toContain("synthetic-");
  });
});

describe("findGraphMediaTarget", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points to the media endpoint with the bearer token, without needing the phone number", () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v22.0");
    vi.stubEnv("META_PHONE_NUMBER_ID", "");
    vi.stubEnv("META_ACCESS_TOKEN", "synthetic-token");

    expect(findGraphMediaTarget("media-1")).toEqual({
      status: GraphTargetStatus.READY,
      url: "https://graph.facebook.com/v22.0/media-1",
      headers: { Authorization: "Bearer synthetic-token" },
    });
  });

  it("never builds the request when META_ACCESS_TOKEN is missing", () => {
    vi.stubEnv("META_ACCESS_TOKEN", "");

    expect(findGraphMediaTarget("media-1")).toEqual({ status: GraphTargetStatus.MISSING_VARIABLE, variable: "META_ACCESS_TOKEN" });
  });
});
