import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleDisabledResponse } from "@/lib/inbox/console-access";
import { API_ERRORS } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consoleDisabledResponse", () => {
  it("no responde nada cuando la consola está habilitada", () => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "true");
    expect(consoleDisabledResponse()).toBeUndefined();
  });

  it("responde 404 con el formato de error cuando la consola está apagada", async () => {
    vi.stubEnv("SANDBOX_PAGE_ENABLED", "false");
    const response = consoleDisabledResponse();

    expect(response?.status).toBe(API_ERRORS[ApiErrorCode.NOT_FOUND].status);
    await expect(response?.json()).resolves.toMatchObject({ error: ApiErrorCode.NOT_FOUND });
  });
});
