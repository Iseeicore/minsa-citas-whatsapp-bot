import { describe, expect, it } from "vitest";
import { bytesToMegabytes } from "@/lib/utils/byte-size";

describe("bytesToMegabytes", () => {
  it.each([
    ["converts whole megabytes", 5 * 1024 * 1024, 5],
    ["keeps the fraction of a partial megabyte", 1024 * 1024 + 512 * 1024, 1.5],
  ])("%s", (_case, bytes, megabytes) => {
    expect(bytesToMegabytes(bytes)).toBe(megabytes);
  });
});
