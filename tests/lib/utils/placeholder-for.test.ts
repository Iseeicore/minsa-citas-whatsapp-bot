import { describe, expect, it } from "vitest";
import { placeholderFor } from "@/lib/utils/placeholder-for";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";

const TEXTS = { loading: "Cargando…", empty: "Vacío." };

describe("placeholderFor", () => {
  it("shows the loading text while the list loads", () => {
    expect(placeholderFor({ status: ApiRequestStatus.LOADING }, TEXTS)).toBe("Cargando…");
  });

  it("shows the empty text when the list arrived empty", () => {
    expect(placeholderFor({ status: ApiRequestStatus.DATA, data: [] }, TEXTS)).toBe("Vacío.");
  });

  it("shows nothing when there are rows or the request failed", () => {
    expect(placeholderFor({ status: ApiRequestStatus.DATA, data: [1] }, TEXTS)).toBeUndefined();
    expect(placeholderFor({ status: ApiRequestStatus.ERROR, message: "x", lastData: [] }, TEXTS)).toBeUndefined();
  });
});
