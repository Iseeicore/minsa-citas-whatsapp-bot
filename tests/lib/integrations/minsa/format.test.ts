import { describe, expect, it } from "vitest";
import { formatHoraCita } from "@/lib/integrations/minsa/format";

describe("formatHoraCita", () => {
  it.each([
    ["09:40", "0940"],
    ["00:30", "0030"],
    ["16:10", "1610"],
  ])("manda %s al MINSA como %s, siempre con cuatro dígitos", (horaInicio, horaCita) => {
    expect(formatHoraCita(horaInicio)).toBe(horaCita);
  });
});
