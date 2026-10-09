import { describe, expect, it } from "vitest";
import { decidirCandidatos, type Candidato } from "@/lib/establecimientos/decidir";

const fila = (nombre: string, similitud: number, similitudPalabra: number, id = 1): Candidato => ({
  id,
  areaId: id,
  codigoRenipress: String(1000 + id),
  nombre,
  distrito: null,
  similitud,
  similitudPalabra,
});

describe("decidirCandidatos con los valores medidos en el padrón", () => {
  it("nothing passes the threshold: none (a story is not a place)", () => {
    expect(decidirCandidatos([fila("HOSPITAL NACIONAL DOS DE MAYO", 0.22, 0.32), fila("Hospital Nacional Hipólito Unanue", 0.2, 0.32, 2)])).toEqual({
      kind: "ninguno",
    });
    expect(decidirCandidatos([])).toEqual({ kind: "ninguno" });
  });

  it("an almost exact name wins even if others look alike", () => {
    const decision = decidirCandidatos([
      fila("HOSPITAL NACIONAL DOS DE MAYO", 1, 1),
      fila("HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME", 0.38, 0.68, 2),
      fila("Hospital Nacional Hipólito Unanue", 0.4, 0.61, 3),
    ]);
    expect(decision).toMatchObject({ kind: "uno", establecimiento: { nombre: "HOSPITAL NACIONAL DOS DE MAYO" } });
  });

  it("a name that is clearly ahead of the next one wins", () => {
    const decision = decidirCandidatos([fila("HOSPITAL NACIONAL DOS DE MAYO", 0.71, 0.71), fila("Hospital de Lima Este - Vitarte (III-E)", 0.29, 0.6, 2)]);
    expect(decision).toMatchObject({ kind: "uno", establecimiento: { id: 1 } });
  });

  it("a single candidate is the one to confirm", () => {
    expect(decidirCandidatos([fila("HOSPITAL NACIONAL DOS DE MAYO", 0.47, 0.5)])).toMatchObject({ kind: "uno" });
  });

  it("the type alone (the four hospitals) is never a list: it asks for the full name", () => {
    const hospitales = ["HOSPITAL NACIONAL DOS DE MAYO", "Hospital Nacional Hipólito Unanue", "Hospital de Lima Este - Vitarte (III-E)", "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME"];
    expect(decidirCandidatos(hospitales.map((nombre, i) => fila(nombre, 0.3 - i * 0.01 + 0.02, 1, i + 1)))).toEqual({ kind: "varios", total: 4 });
  });

  it("too many matches (170 centros de salud) also ask for the name", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => fila(`CENTRO DE SALUD ${i}`, 0.76 - i * 0.005, 1, i + 1));
    expect(decidirCandidatos(muchos)).toEqual({ kind: "varios", total: 8 });
  });

  it("several that look alike (the three of San Borja) are not offered as a list either", () => {
    const decision = decidirCandidatos([fila("C.S.M. COMUNITARIO SAN BORJA", 0.33, 0.56), fila("HOGAR PROTEGIDO SAN BORJA", 0.31, 0.56, 2), fila("CENTRO DE SALUD TODOS LOS SANTOS SAN BORJA", 0.3, 0.56, 3)]);
    expect(decision).toEqual({ kind: "varios", total: 3 });
  });

  it("a word-level match passes even with a low similarity (dos de mayo)", () => {
    const decision = decidirCandidatos([fila("HOSPITAL NACIONAL DOS DE MAYO", 0.39, 1)]);
    expect(decision).toMatchObject({ kind: "uno" });
  });
});
