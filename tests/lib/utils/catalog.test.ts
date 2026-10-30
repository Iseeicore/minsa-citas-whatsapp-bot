import { describe, expect, it } from "vitest";
import { listAvailableEstablecimientos, findPageAfterEmpty } from "@/lib/utils/catalog";

const MAX_SKIPS = 3;

describe("findPageAfterEmpty", () => {
  it.each([
    [
      "advances to the next page and counts the jump",
      { page: 1, totalPages: 5, skips: 0, backFrom: undefined },
      { page: 2, skips: 1, clearBackFrom: false },
    ],
    ["stops advancing once the jumps reach the limit", { page: 2, totalPages: 9, skips: MAX_SKIPS, backFrom: undefined }, undefined],
    ["stops advancing on the last page", { page: 5, totalPages: 5, skips: 0, backFrom: undefined }, undefined],
    [
      "goes back one page while going backwards and counts the jump",
      { page: 3, totalPages: 5, skips: 1, backFrom: 4 },
      { page: 2, skips: 2, clearBackFrom: false },
    ],
    [
      "returns to the page it went back from when there is no previous page left",
      { page: 1, totalPages: 5, skips: 0, backFrom: 2 },
      { page: 2, skips: MAX_SKIPS, clearBackFrom: true },
    ],
    [
      "returns to the page it went back from once the jumps reach the limit",
      { page: 3, totalPages: 5, skips: MAX_SKIPS, backFrom: 4 },
      { page: 4, skips: MAX_SKIPS, clearBackFrom: true },
    ],
  ])("%s", (_name, position, expected) => {
    expect(findPageAfterEmpty(position, MAX_SKIPS)).toEqual(expected);
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
