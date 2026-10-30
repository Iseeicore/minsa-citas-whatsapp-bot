import { describe, expect, it } from "vitest";
import { formatMegabytes } from "@/lib/utils/format-megabytes";
import { MAX_IMAGE_BYTES } from "@/lib/recepcion/imagenes/data-uri";

describe("formatMegabytes", () => {
  it("escribe el tope de las imágenes como «5 MB»", () => {
    expect(formatMegabytes(MAX_IMAGE_BYTES)).toBe("5 MB");
  });

  it("convierte cualquier múltiplo de un megabyte", () => {
    expect(formatMegabytes(2 * 1024 * 1024)).toBe("2 MB");
  });
});
