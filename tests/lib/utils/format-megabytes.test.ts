import { describe, expect, it } from "vitest";
import { formatMegabytes } from "@/lib/utils/format-megabytes";
import { evidenceImageMaxBytes } from "@/lib/config/evidence";

describe("formatMegabytes", () => {
  it("escribe el tope de las imágenes como «5 MB»", () => {
    expect(formatMegabytes(evidenceImageMaxBytes({}))).toBe("5 MB");
  });

  it("convierte cualquier múltiplo de un megabyte", () => {
    expect(formatMegabytes(2 * 1024 * 1024)).toBe("2 MB");
  });
});
