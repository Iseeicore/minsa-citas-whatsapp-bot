import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("une las clases en una sola cadena separada por espacios", () => {
    expect(cn("p-4", "rounded-lg border")).toBe("p-4 rounded-lg border");
  });

  it("descarta los valores vacíos y los que no son verdaderos", () => {
    expect(cn("p-4", "", false, null, undefined, 0, "border")).toBe("p-4 border");
    expect(cn()).toBe("");
    expect(cn("", undefined)).toBe("");
  });

  it("agrega una clase solo cuando su condición se cumple", () => {
    const esUrgente = true;

    expect(cn("p-4", esUrgente && "bg-red-100", !esUrgente && "bg-white")).toBe("p-4 bg-red-100");
    expect(cn("p-4", !esUrgente && "bg-red-100", esUrgente && "bg-white")).toBe("p-4 bg-white");
  });

  it("acepta objetos y arreglos con condiciones", () => {
    expect(cn("p-4", { "bg-red-100": true, "bg-white": false })).toBe("p-4 bg-red-100");
    expect(cn(["p-4", false && "hidden"], ["border"])).toBe("p-4 border");
  });

  it("cuando dos clases de Tailwind chocan gana la que viene después", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-white text-sm", "bg-gray-50")).toBe("text-sm bg-gray-50");
  });

  it("conserva las clases que no chocan aunque compartan prefijo", () => {
    expect(cn("text-sm text-white", "text-left")).toBe("text-sm text-white text-left");
    expect(cn("px-2", "md:px-4")).toBe("px-2 md:px-4");
  });
});
