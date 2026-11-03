import { describe, expect, it } from "vitest";
import { startOfTodayInLima } from "@/lib/time/lima-clock";

describe("startOfTodayInLima", () => {
  it("de noche en Lima, con la fecha UTC ya en el día siguiente, devuelve la medianoche del día de Lima", () => {
    expect(startOfTodayInLima(new Date("2026-11-03T03:30:00.000Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("la medianoche de Lima es el primer instante del día y el instante anterior pertenece al día previo", () => {
    expect(startOfTodayInLima(new Date("2026-11-03T05:00:00.000Z")).toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(startOfTodayInLima(new Date("2026-11-03T04:59:59.999Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
