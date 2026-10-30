import { describe, expect, it } from "vitest";
import { bytesToMegabytes } from "@/lib/utils/byte-size";

describe("bytesToMegabytes", () => {
  it("converts whole megabytes", () => {
    expect(bytesToMegabytes(5 * 1024 * 1024)).toBe(5);
  });

  it("keeps the fraction of a partial megabyte", () => {
    expect(bytesToMegabytes(1024 * 1024 + 512 * 1024)).toBe(1.5);
  });
});
