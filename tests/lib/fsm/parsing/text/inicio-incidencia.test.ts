import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";

const PADRON: { nombre: string; codigo_renipress: string }[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "prisma", "seeds", "eess", "establecimientos.json"), "utf8"),
);

const qr = (nombre: string, codigo: string) => `Hola quiero presentar una incidencia ${nombre} - CODIGO-IPRESS ${codigo}`;

describe("parseInicioIncidencia: message of the QR (with the CODIGO-IPRESS label)", () => {
  it("reads the message the QR preloads", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206")).toEqual({
      origen: "qr",
      codigoRenipress: "6206",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
    });
  });

  it("drops the leading zeros of the code", () => {
    expect(parseInicioIncidencia(qr("HOSPITAL NACIONAL DOS DE MAYO", "00006206"))?.codigoRenipress).toBe("6206");
  });

  it("does not care about case, double spaces, line breaks or a final sign", () => {
    expect(parseInicioIncidencia("hola  quiero presentar una incidencia  Hospital Dos de Mayo -  codigo-ipress  6206 ")).toEqual({
      origen: "qr",
      codigoRenipress: "6206",
      nombre: "Hospital Dos de Mayo",
    });
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia\nPOSTA MEDICA - CODIGO-IPRESS 5862.")).toEqual({
      origen: "qr",
      codigoRenipress: "5862",
      nombre: "POSTA MEDICA",
    });
  });

  it("accepts accents in the label and keeps them in the name", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia CENTRO DE ATENCIÓN DEL ADULTO MAYOR - CÓDIGO-IPRESS 15544")).toEqual({
      origen: "qr",
      codigoRenipress: "15544",
      nombre: "CENTRO DE ATENCIÓN DEL ADULTO MAYOR",
    });
  });

  it("cuts at the CODIGO-IPRESS label, not at a hyphen inside the name", () => {
    expect(parseInicioIncidencia(qr("C.S. VILLA - NORTE", "5862"))).toEqual({ origen: "qr", codigoRenipress: "5862", nombre: "C.S. VILLA - NORTE" });
  });

  it.each(["PENDIENTE-1", "62O6", "0", "000", "123456789", "-5"])("a code that is not valid (%j) leaves only the name", (codigo) => {
    expect(parseInicioIncidencia(qr("POSTA MEDICA", codigo))).toEqual({ origen: "qr", nombre: "POSTA MEDICA" });
  });

  it("without a name it still returns the code", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia CODIGO-IPRESS 6206")).toEqual({ origen: "qr", codigoRenipress: "6206" });
  });

  it("keeps what the person adds after the code, as written, and still reads the QR", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206 me cobraron sin recibo en admisión")).toEqual({
      origen: "qr",
      codigoRenipress: "6206",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
      resto: "me cobraron sin recibo en admisión",
    });
    expect(parseInicioIncidencia(`${qr("POSTA MEDICA", "5862")}\nno había medicinas`)).toEqual({
      origen: "qr",
      codigoRenipress: "5862",
      nombre: "POSTA MEDICA",
      resto: "no había medicinas",
    });
  });

  it("a final sign is not an added text", () => {
    expect(parseInicioIncidencia(`${qr("POSTA MEDICA", "5862")}.`)).toEqual({ origen: "qr", codigoRenipress: "5862", nombre: "POSTA MEDICA" });
  });

  it.each(["Hola, quiero presentar una incidencia", "Buenas tardes quiero presentar una incidencia", "quiero presentar una incidencia", "Hola quiero reportar una incidencia"])(
    "does not depend on how the person greets (%j)",
    (prefix) => {
      expect(parseInicioIncidencia(`${prefix} POSTA MEDICA - CODIGO-IPRESS 5862`)).toEqual({ origen: "qr", codigoRenipress: "5862", nombre: "POSTA MEDICA" });
    },
  );

  it("never joins a code with letters stuck to it (6206me is not 6206)", () => {
    expect(parseInicioIncidencia(qr("POSTA MEDICA", "6206me cobraron"))).toEqual({ origen: "qr", nombre: "POSTA MEDICA", resto: "cobraron" });
    expect(parseInicioIncidencia(qr("POSTA MEDICA", "62O6"))).toEqual({ origen: "qr", nombre: "POSTA MEDICA" });
  });

  it("with two labels it takes the first and leaves the rest as added text", () => {
    expect(parseInicioIncidencia(qr("POSTA MEDICA", "5862 - CODIGO-IPRESS 7000"))).toEqual({
      origen: "qr",
      codigoRenipress: "5862",
      nombre: "POSTA MEDICA",
      resto: "CODIGO-IPRESS 7000",
    });
  });

  it("drops a name that is too long to be an establecimiento", () => {
    expect(parseInicioIncidencia(qr("A".repeat(400), "6206"))).toEqual({ origen: "qr", codigoRenipress: "6206" });
  });

  it("recognises the message of every establecimiento of the padron, with its code", () => {
    for (const fila of PADRON) {
      const result = parseInicioIncidencia(qr(fila.nombre, fila.codigo_renipress));
      expect(result?.origen, fila.nombre).toBe("qr");
      expect(result?.codigoRenipress, fila.nombre).toBe(fila.codigo_renipress);
    }
  });

  it("none of those messages is rejected by the first-message filter", () => {
    for (const fila of PADRON) {
      expect(checkFirstMessagePayload({ type: "text", text: qr(fila.nombre, fila.codigo_renipress) }).kind, fila.nombre).toBe("ok");
    }
  });
});

describe("parseInicioIncidencia: only the name, without the code", () => {
  it("takes the name as a candidate to look up in the padron", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia HOSPITAL NACIONAL DOS DE MAYO")).toEqual({
      origen: "texto",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
    });
  });

  it("skips the little words that lead the name", () => {
    expect(parseInicioIncidencia("quiero presentar una incidencia en el HOSPITAL NACIONAL DOS DE MAYO")).toEqual({
      origen: "texto",
      nombre: "HOSPITAL NACIONAL DOS DE MAYO",
    });
  });

  it("with nothing after the sentence there is no name, and the place will be asked", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia")).toEqual({ origen: "texto" });
    expect(parseInicioIncidencia("quiero presentar una incidencia.")).toEqual({ origen: "texto" });
  });

  it("a long story is not a name: it is dropped and the place will be asked", () => {
    expect(
      parseInicioIncidencia("quiero presentar una incidencia porque el doctor me atendió mal y además me cobraron sin recibo en la ventanilla de admisión"),
    ).toEqual({ origen: "texto" });
  });

  it("a short story still comes out as a candidate: the lookup and the confirmation decide", () => {
    expect(parseInicioIncidencia("quiero presentar una incidencia en el hospital porque me cobraron")).toEqual({
      origen: "texto",
      nombre: "hospital porque me cobraron",
    });
  });

  it("a label with no value behind it is not a QR, but the sentence is still read", () => {
    expect(parseInicioIncidencia("Hola quiero presentar una incidencia POSTA MEDICA CODIGO-IPRESS")).toEqual({
      origen: "texto",
      nombre: "POSTA MEDICA CODIGO-IPRESS",
    });
  });

  it.each(["", "Hola", "quiero hacer un reclamo", "Quiero una cita - CODIGO-IPRESS 6206", "HOSPITAL NACIONAL DOS DE MAYO - CODIGO-IPRESS 6206", "tengo algo que reportar"])(
    "%j does not start an incidencia by this parser",
    (text) => {
      expect(parseInicioIncidencia(text)).toBeNull();
    },
  );
});
