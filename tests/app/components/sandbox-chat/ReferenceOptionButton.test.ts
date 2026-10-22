import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

const render = (disabled = false, value = reference, unavailable = false): string =>
  renderToStaticMarkup(createElement(ReferenceOptionButton, { reference: value, disabled, unavailable, onClick: () => {} }));

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

  it("una referencia que no permite agendar se ve atenuada, se anuncia como no disponible y no dispara la selección", () => {
    const onClick = vi.fn();
    const element = ReferenceOptionButton({ reference, unavailable: true, onClick });
    const props = element.props as { onClick?: unknown; "aria-disabled"?: unknown };
    const markup = render(false, reference, true);

    expect(props.onClick).toBeUndefined();
    expect(props["aria-disabled"]).toBe(true);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("bg-sb-muted");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(reference.estado);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("una referencia seleccionable conserva su acción y no se anuncia como bloqueada", () => {
    const onClick = vi.fn();
    const element = ReferenceOptionButton({ reference, onClick });
    const props = element.props as { onClick?: () => void; "aria-disabled"?: unknown };

    props.onClick?.();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(props["aria-disabled"]).toBeUndefined();
    expect(render()).not.toContain("aria-disabled");
    expect(render()).not.toContain("bg-sb-muted");
  });

  it("el estado de mensaje antiguo sigue siendo independiente del bloqueo por estado", () => {
    expect(render(true)).toContain('disabled=""');
    expect(render(true)).not.toContain("aria-disabled");
    expect(render(true, reference, true)).toContain('disabled=""');
    expect(render(true, reference, true)).toContain('aria-disabled="true"');
  });
});
