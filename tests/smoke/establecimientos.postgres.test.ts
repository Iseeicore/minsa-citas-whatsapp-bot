import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { decidirCandidatos } from "@/lib/establecimientos/decidir";
import { buscarPorCodigo, buscarPorNombre } from "@/lib/establecimientos/repositorio";

const PADRON: { nombre: string; codigo_renipress: string }[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "prisma", "seeds", "eess", "establecimientos.json"), "utf8"),
);

const decidir = async (texto: string) => {
  const result = await buscarPorNombre(texto);
  if (result.status !== "ok") throw new Error("la búsqueda no respondió");
  return decidirCandidatos(result.candidatos);
};

describe.skipIf(!process.env.DATABASE_URL)("search of establecimientos against the real padron", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("every one of the 434 codes resolves to its own establecimiento", async () => {
    for (const fila of PADRON) {
      const result = await buscarPorCodigo(fila.codigo_renipress);
      expect(result.status, fila.nombre).toBe("found");
      if (result.status === "found") expect(result.establecimiento.nombre.trim()).toBe(fila.nombre.trim());
    }
  });

  it("an unknown code is not found", async () => {
    await expect(buscarPorCodigo("99999999")).resolves.toEqual({ status: "not_found" });
  });

  it("the exact name of every establecimiento finds it as the answer, or at least among the candidates", async () => {
    const repetidos = new Set(PADRON.map((f) => f.nombre.toUpperCase()).filter((n, i, todos) => todos.indexOf(n) !== i));
    for (const fila of PADRON.filter((f) => !repetidos.has(f.nombre.toUpperCase()))) {
      const result = await buscarPorNombre(fila.nombre);
      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.candidatos.map((c) => c.codigoRenipress), fila.nombre).toContain(fila.codigo_renipress);
    }
  });

  it("the full name of the Hospital Dos de Mayo is the single answer", async () => {
    await expect(decidir("HOSPITAL NACIONAL DOS DE MAYO")).resolves.toMatchObject({ kind: "uno", establecimiento: { codigoRenipress: "6206" } });
  });

  it("tolerates typos and accents", async () => {
    await expect(decidir("hospitl dos de mayu")).resolves.toMatchObject({ kind: "uno", establecimiento: { codigoRenipress: "6206" } });
    await expect(decidir("hospital hipolito unanue")).resolves.toMatchObject({ kind: "uno", establecimiento: { codigoRenipress: "5946" } });
  });

  it("a story is not a place", async () => {
    await expect(decidir("hospital porque me cobraron")).resolves.toEqual({ kind: "ninguno" });
    await expect(decidir("el doctor me atendió mal en la ventanilla")).resolves.toEqual({ kind: "ninguno" });
  });

  it("the type alone is never a list: the four hospitals and the 170 centros de salud ask for the full name", async () => {
    await expect(decidir("hospital")).resolves.toMatchObject({ kind: "varios" });
    await expect(decidir("centro de salud")).resolves.toMatchObject({ kind: "varios" });
  });

  it("«posta» finds the puestos de salud thanks to the synonym", async () => {
    const result = await buscarPorNombre("posta buena vista");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.candidatos[0]?.nombre).toMatch(/PUESTO DE SALUD BUENA VISTA/i);
  });
});
