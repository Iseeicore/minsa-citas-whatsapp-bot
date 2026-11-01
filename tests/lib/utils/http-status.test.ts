import { describe, expect, it } from "vitest";
import { isServerErrorStatus } from "@/lib/utils/http-status";

describe("isServerErrorStatus", () => {
  it("is true from 500 up", () => {
    expect([500, 502, 503, 599].map(isServerErrorStatus)).toEqual([true, true, true, true]);
  });

  it("is false for success, client errors and the network failure 0", () => {
    expect([0, 200, 404, 429, 499].map(isServerErrorStatus)).toEqual([false, false, false, false, false]);
  });
});
