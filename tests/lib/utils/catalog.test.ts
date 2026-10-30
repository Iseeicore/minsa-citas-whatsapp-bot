import { describe, expect, it } from "vitest";
import { listAvailableEstablecimientos, findPageAfterEmpty } from "@/lib/utils/catalog";

const MAX_SKIPS = 3;

describe("findPageAfterEmpty", () => {
  it("advances to the next page and counts the jump", () => {
    expect(findPageAfterEmpty({ page: 1, totalPages: 5, skips: 0, backFrom: undefined }, MAX_SKIPS)).toEqual({
      page: 2,
      skips: 1,
      clearBackFrom: false,
    });
  });

  it("stops advancing once the jumps reach the limit", () => {
    expect(findPageAfterEmpty({ page: 2, totalPages: 9, skips: MAX_SKIPS, backFrom: undefined }, MAX_SKIPS)).toBeUndefined();
  });

  it("stops advancing on the last page", () => {
    expect(findPageAfterEmpty({ page: 5, totalPages: 5, skips: 0, backFrom: undefined }, MAX_SKIPS)).toBeUndefined();
  });

  it("goes back one page while going backwards and counts the jump", () => {
    expect(findPageAfterEmpty({ page: 3, totalPages: 5, skips: 1, backFrom: 4 }, MAX_SKIPS)).toEqual({
      page: 2,
      skips: 2,
      clearBackFrom: false,
    });
  });

  it("returns to the page it went back from when there is no previous page left", () => {
    expect(findPageAfterEmpty({ page: 1, totalPages: 5, skips: 0, backFrom: 2 }, MAX_SKIPS)).toEqual({
      page: 2,
      skips: MAX_SKIPS,
      clearBackFrom: true,
    });
  });

  it("returns to the page it went back from once the jumps reach the limit", () => {
    expect(findPageAfterEmpty({ page: 3, totalPages: 5, skips: MAX_SKIPS, backFrom: 4 }, MAX_SKIPS)).toEqual({
      page: 4,
      skips: MAX_SKIPS,
      clearBackFrom: true,
    });
  });
});

describe("listAvailableEstablecimientos", () => {
  const item = (renipressCode: string, quotasOnline: number) => ({ renipressCode, quotasOnline });

  it("keeps only the establecimientos with online quotas that were not discarded", () => {
    const items = [item("1", 2), item("2", 0), item("3", 1), item("4", 5)];

    expect(listAvailableEstablecimientos(items, ["4"])).toEqual([item("1", 2), item("3", 1)]);
  });

  it("keeps the extra fields of each establecimiento", () => {
    const items = [{ renipressCode: "1", quotasOnline: 1, establishmentName: "CENTRO DE SALUD 1" }];

    expect(listAvailableEstablecimientos(items, [])).toEqual(items);
  });
});
