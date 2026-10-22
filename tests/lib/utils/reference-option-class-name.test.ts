import { describe, expect, it } from "vitest";
import { referenceOptionClassNames } from "@/lib/utils/reference-option-class-name";

describe("referenceOptionClassNames", () => {
  it("atenúa la tarjeta, el título y la etiqueta de una referencia que no permite agendar", () => {
    const blocked = referenceOptionClassNames(true);

    expect(blocked.card).toContain("bg-sb-muted");
    expect(blocked.card).toContain("cursor-not-allowed");
    expect(blocked.title).toContain("text-sb-muted-text");
    expect(blocked.badge).toContain("text-sb-muted-text");
  });

  it("no reutiliza las clases del estado de mensaje antiguo", () => {
    for (const value of Object.values(referenceOptionClassNames(true))) expect(value).not.toContain("disabled:");
  });

  it("una referencia seleccionable conserva los colores actuales", () => {
    const available = referenceOptionClassNames(false);

    expect(Object.values(available).join(" ")).not.toContain("sb-muted");
    expect(available.title).toContain("text-sb-navy");
    expect(available.badge).toBe("bg-sb-panel text-sb-navy");
  });
});
