import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferenceOptionButton } from "@/app/components/sandbox-chat/ReferenceOptionButton";
import type { ReferenciaListaDetalle } from "@/lib/types/referencia-lista-detalle";

const reference: ReferenciaListaDetalle = {
  especialidad: "Atencion especializada integral de enfermedades cardiovasculares avanzadas",
  numero: "0000000427",
  destino: "Instituto Nacional Especializado de Diagnostico y Tratamiento Multidisciplinario",
  origen: "Centro de Salud San Francisco de la Esperanza Alta",
  fecha: "17/10/2026 08:00",
  estado: "PACIENTE RECIBIDO",
};

const render = (disabled = false, value = reference): string =>
  renderToStaticMarkup(createElement(ReferenceOptionButton, { reference: value, disabled, onClick: () => {} }));

describe("ReferenceOptionButton", () => {
  it("presenta la especialidad y todos los datos completos de la referencia sin recortarlos", () => {
    const markup = render();

    for (const value of Object.values(reference)) expect(markup).toContain(value);
    expect(markup.indexOf(reference.especialidad)).toBeLessThan(markup.indexOf(reference.destino));
    expect(markup).toContain('type="button"');
  });

  it("impide seleccionar referencias de un mensaje antiguo mediante el boton nativo deshabilitado", () => {
    expect(render(true)).toContain('disabled=""');
    expect(render()).not.toContain('disabled=""');
  });

  it("presenta los textos del servicio como contenido y evita interpretarlos como HTML", () => {
    const markup = render(false, { ...reference, destino: "<script>contenido remoto</script>" });

    expect(markup).toContain("&lt;script&gt;contenido remoto&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
