import { createElement, isValidElement, type ReactNode } from "react";
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

const render = (disabled = false, value = reference): string =>
  renderToStaticMarkup(createElement(ReferenceOptionButton, { reference: value, disabled, onClick: () => {} }));

const buttonTag = (markup: string): string => markup.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";

function findClickHandler(node: ReactNode): (() => void) | undefined {
  if (!isValidElement(node)) return undefined;
  const props = node.props as { onClick?: () => void; children?: ReactNode };
  if (props.onClick) return props.onClick;
  const children = Array.isArray(props.children) ? props.children : [props.children];
  return children.map(findClickHandler).find(Boolean);
}

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

  it("la tarjeta es un div con bloques div y un solo botón que la cubre, sin div dentro del botón", () => {
    const markup = render();
    const button = buttonTag(markup);

    expect(markup.startsWith("<div")).toBe(true);
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(button).not.toContain("<div");
    expect(button).toContain("absolute inset-0");
  });

  it("el botón se anuncia con la especialidad, el número y el estado de la referencia", () => {
    expect(buttonTag(render())).toContain(
      'aria-label="Atencion especializada integral de enfermedades cardiovasculares avanzadas, Referencia N.° 0000000427, PACIENTE RECIBIDO"',
    );
  });

  it("una referencia conserva su acción al elegirla", () => {
    const onClick = vi.fn();

    findClickHandler(ReferenceOptionButton({ reference, onClick }))?.();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
