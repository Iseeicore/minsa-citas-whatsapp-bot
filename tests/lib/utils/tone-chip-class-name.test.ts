import { describe, expect, it } from "vitest";
import { toneChipClassName } from "@/lib/utils/tone-chip-class-name";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";

describe("toneChipClassName", () => {
  it("da a cada tono su propio color de fondo y de ícono, tomado de los tokens del tema", () => {
    const classes = Object.values(ReferenciaTono).map(toneChipClassName);

    expect(new Set(classes).size).toBe(classes.length);
    expect(toneChipClassName(ReferenciaTono.EXITO)).toContain("bg-estado-exito-tint");
    expect(toneChipClassName(ReferenciaTono.EXITO)).toContain("text-estado-exito");
    expect(toneChipClassName(ReferenciaTono.INFO)).toContain("text-estado-info");
    expect(toneChipClassName(ReferenciaTono.NEUTRO)).toContain("text-estado-neutro");
  });

  it("no usa valores arbitrarios de Tailwind", () => {
    for (const tono of Object.values(ReferenciaTono)) expect(toneChipClassName(tono)).not.toMatch(/\[/);
  });
});
