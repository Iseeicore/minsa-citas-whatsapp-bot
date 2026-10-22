import { describe, expect, it } from "vitest";
import { referenceRowDescription } from "@/lib/utils/reference-row-description";
import { referenciaListDescriptionText } from "@/lib/constants/textos/cita-reserva";
import { WHATSAPP_ROW_DESCRIPTION_MAX } from "@/lib/constants/limits/whatsapp";

const LARGO = "HOSPITAL NACIONAL ARZOBISPO LOAYZA DE LA CIUDAD DE LIMA METROPOLITANA";
const parts = { destino: "HOSPITAL MARIA AUXILIADORA", numero: "02441", fecha: "12/12/2017", estado: "PACIENTE CITADO" };

describe("referenceRowDescription", () => {
  it("deja intacta una descripción que ya entra", () => {
    expect(referenceRowDescription(parts, WHATSAPP_ROW_DESCRIPTION_MAX)).toBe(
      referenciaListDescriptionText(parts.destino, parts.numero, parts.fecha, parts.estado),
    );
  });

  it("acorta solo el destino con … y conserva número, fecha y estado completos", () => {
    const description = referenceRowDescription({ ...parts, destino: LARGO }, WHATSAPP_ROW_DESCRIPTION_MAX);

    expect(description).toBe("HOSPITAL NACIONAL ARZOBISPO L… · N° 02441 · 12/12/2017 · PACIENTE CITADO");
    expect(description).toHaveLength(WHATSAPP_ROW_DESCRIPTION_MAX);
  });

  it("con un estado larguísimo deja un destino mínimo y acorta el estado como último recurso", () => {
    const estado = "REFERENCIA OBSERVADA POR LA OFICINA DE SEGUROS Y PENDIENTE DE SUBSANACIÓN DOCUMENTARIA";
    const description = referenceRowDescription({ ...parts, destino: LARGO, estado }, WHATSAPP_ROW_DESCRIPTION_MAX);

    expect(description).toHaveLength(WHATSAPP_ROW_DESCRIPTION_MAX);
    expect(description.startsWith("H… · N° 02441 · 12/12/2017 · REFERENCIA OBSERVADA")).toBe(true);
    expect(description.endsWith("…")).toBe(true);
  });

  it("nunca pasa del máximo aunque número y fecha no entren", () => {
    const description = referenceRowDescription(
      { destino: LARGO, numero: "9".repeat(90), fecha: "12/12/2017", estado: "ACEPTADO" },
      WHATSAPP_ROW_DESCRIPTION_MAX,
    );

    expect(description.length).toBeLessThanOrEqual(WHATSAPP_ROW_DESCRIPTION_MAX);
  });
});
