import { describe, expect, it } from "vitest";
import { readRequestData } from "@/lib/utils/read-request-data";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";

describe("readRequestData", () => {
  it("keeps showing the last data while the polling fails", () => {
    expect(readRequestData({ status: ApiRequestStatus.DATA, data: ["u-1"] })).toEqual(["u-1"]);
    expect(readRequestData({ status: ApiRequestStatus.ERROR, message: "x", lastData: ["u-1"] })).toEqual(["u-1"]);
  });

  it("has no data while loading or after a failure with nothing loaded before", () => {
    expect(readRequestData({ status: ApiRequestStatus.LOADING })).toBeUndefined();
    expect(readRequestData({ status: ApiRequestStatus.ERROR, message: "x" })).toBeUndefined();
  });
});
