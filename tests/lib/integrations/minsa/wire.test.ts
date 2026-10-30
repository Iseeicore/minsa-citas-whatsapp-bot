import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endOfMonthYYYYMMDD, postSigned, postWithBearer, todayYYYYMMDD } from "@/lib/integrations/minsa/wire";
import { captureLogs } from "@/tests/support/capture-logs";

describe("MINSA date window uses the Lima calendar day, whatever the server time zone", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("at 23:30 in Lima (04:30 UTC of the next day) today is still the Lima date", () => {
    vi.setSystemTime(new Date("2026-10-01T04:30:00Z"));

    expect(todayYYYYMMDD()).toBe("20260930");
  });

  it("the end of month is the last day of the Lima month, not of the UTC month", () => {
    vi.setSystemTime(new Date("2026-10-01T04:30:00Z"));

    expect(endOfMonthYYYYMMDD()).toBe("20260930");
  });

  it("during the Lima day both match the ordinary calendar", () => {
    vi.setSystemTime(new Date("2026-02-10T15:00:00Z"));

    expect(todayYYYYMMDD()).toBe("20260210");
    expect(endOfMonthYYYYMMDD()).toBe("20260228");
  });
});

describe("a MINSA request is never built without its variables", () => {
  beforeEach(() => {
    vi.stubEnv("MINSA_API_HOST", "https://minsa-api.test");
    vi.stubEnv("MINSA_INTEGRATION_SECRET", "secreto-de-prueba");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["the signed call without MINSA_API_HOST", "MINSA_API_HOST", () => postSigned("/ruta", { a: 1 }), "MINSA_API_HOST_MISSING"],
    [
      "the signed call without MINSA_INTEGRATION_SECRET",
      "MINSA_INTEGRATION_SECRET",
      () => postSigned("/ruta", { a: 1 }),
      "MINSA_INTEGRATION_SECRET_MISSING",
    ],
    ["the bearer call without MINSA_API_HOST", "MINSA_API_HOST", () => postWithBearer("/ruta", { a: 1 }, "jwt"), "MINSA_API_HOST_MISSING"],
  ])("answers %s as MINSA unavailable without calling it, and names the variable", async (_label, variable, call, reason) => {
    vi.stubEnv(variable, "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const logs = captureLogs();

    const response = await call();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs).toContainEqual(expect.objectContaining({ level: "error", event: "minsa.request_blocked", path: "/ruta", reason }));
    expect(JSON.stringify(logs)).not.toContain("secreto-de-prueba");
  });

  it("calls the configured host when every variable is set", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await postSigned("/ruta", { a: 1 });

    expect(fetchMock).toHaveBeenCalledWith("https://minsa-api.test/ruta", expect.anything());
  });
});
