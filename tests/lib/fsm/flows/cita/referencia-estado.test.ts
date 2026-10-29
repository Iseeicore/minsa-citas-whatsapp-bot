import { describe, expect, it } from "vitest";
import {
  esReferenciaSeleccionable,
  referenciaBloqueadaAviso,
  referenciaEstadoEtiqueta,
  tieneReferenciasSeleccionables,
} from "@/lib/fsm/flows/cita/steps/booking/referencia-estado";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaEstadoCodigo } from "@/lib/enums/referencia-estado-codigo";
import { REFERENCIA_ESTADOS_SELECCIONABLES } from "@/lib/constants/referencias";
import {
  REFERENCIA_SIN_PROGRAMACION_ETIQUETA,
  REFERENCIA_SIN_PROGRAMACION_TEXT,
  referenciaBloqueadaText,
  referenciaEstadoCodigoText,
} from "@/lib/constants/textos/cita-reserva";

const BASE: ReferenciaItem = {
  idReferencia: "synthetic-0",
  numero: "000",
  fechaInicio: "01/10/2026 10:00",
  ipressOrigen: "CENTRO SINTETICO",
  ipressDestino: "HOSPITAL SINTETICO",
  upsOrigen: "CONSULTA EXTERNA",
  upsDestino: "CARDIOLOGIA",
  codigoIpressDestino: "eess-0",
  codigoUpsDestino: "ups-0",
  estado: 3,
};

const conEstado = (estado: number, extra: Partial<ReferenciaItem> = {}): ReferenciaItem => ({
  ...BASE,
  idReferencia: `synthetic-${estado}-${extra.idReferencia ?? ""}`,
  estado,
  ...extra,
});

describe("estados de referencia que permiten agendar", () => {
  it("solo 3 y 5 son seleccionables; 7 (PACIENTE CITADO) ya no permite agendar", () => {
    expect([...REFERENCIA_ESTADOS_SELECCIONABLES].sort()).toEqual([
      ReferenciaEstadoCodigo.ACEPTADO,
      ReferenciaEstadoCodigo.PACIENTE_RECIBIDO,
    ]);
    expect(REFERENCIA_ESTADOS_SELECCIONABLES.has(ReferenciaEstadoCodigo.PACIENTE_CITADO)).toBe(false);
    expect([3, 5].map((estado) => esReferenciaSeleccionable(conEstado(estado)))).toEqual([true, true]);
    expect([0, 1, 2, 4, 6, 7, 8, 99].map((estado) => esReferenciaSeleccionable(conEstado(estado)))).toEqual(Array(8).fill(false));
  });
});

describe("referenciaEstadoEtiqueta", () => {
  it("los estados 3, 5 y 7 usan su etiqueta propia aunque MINSA mande otra descripción", () => {
    expect(referenciaEstadoEtiqueta(conEstado(3, { estadoDescripcion: "otra cosa" }))).toBe("ACEPTADO");
    expect(referenciaEstadoEtiqueta(conEstado(5))).toBe("PACIENTE RECIBIDO");
    expect(referenciaEstadoEtiqueta(conEstado(7))).toBe("PACIENTE CITADO");
  });

  it("un estado desconocido usa la descripción que manda MINSA", () => {
    expect(referenciaEstadoEtiqueta(conEstado(4, { estadoDescripcion: "  ANULADO  " }))).toBe("ANULADO");
  });

  it.each([undefined, "", "   "])("sin descripción (%j) usa el código del estado", (estadoDescripcion) => {
    expect(referenciaEstadoEtiqueta(conEstado(9, { estadoDescripcion }))).toBe("Código 9");
    expect(referenciaEstadoCodigoText(9)).toBe("Código 9");
  });

  it("el estado 7 conserva su etiqueta y su aviso de bloqueo", () => {
    expect(referenciaEstadoEtiqueta(conEstado(7))).toBe("PACIENTE CITADO");
    expect(referenciaBloqueadaText(referenciaEstadoEtiqueta(conEstado(7)))).toBe(
      "Esta referencia está en estado PACIENTE CITADO y no permite agendar una cita. Elige otra.",
    );
  });

  it("el aviso de bloqueo nombra la etiqueta del estado", () => {
    expect(referenciaBloqueadaText("ANULADO")).toBe("Esta referencia está en estado ANULADO y no permite agendar una cita. Elige otra.");
  });
});

describe("referencias sin programación", () => {
  const aceptada = conEstado(3, { idReferencia: "sin-cupos" });
  const recibida = conEstado(5, { idReferencia: "con-cupos" });
  const pendiente = conEstado(1, { idReferencia: "pendiente", estadoDescripcion: "PENDIENTE" });
  const sinProgramacion: ReadonlySet<string> = new Set(["sin-cupos"]);

  it("una referencia de estado 3 o 5 sin programación deja de ser seleccionable y muestra esa etiqueta", () => {
    expect(esReferenciaSeleccionable(aceptada)).toBe(true);
    expect(esReferenciaSeleccionable(aceptada, sinProgramacion)).toBe(false);
    expect(esReferenciaSeleccionable(recibida, sinProgramacion)).toBe(true);
    expect(referenciaEstadoEtiqueta(aceptada, sinProgramacion)).toBe(REFERENCIA_SIN_PROGRAMACION_ETIQUETA);
    expect(REFERENCIA_SIN_PROGRAMACION_ETIQUETA).toBe("Sin programación");
    expect(referenciaEstadoEtiqueta(aceptada)).toBe("ACEPTADO");
  });

  it("cuenta como no seleccionable", () => {
    expect(tieneReferenciasSeleccionables([aceptada, pendiente], sinProgramacion)).toBe(false);
    expect(tieneReferenciasSeleccionables([aceptada, pendiente])).toBe(true);
  });

  it("el aviso distingue la falta de programación del estado bloqueado", () => {
    expect(REFERENCIA_SIN_PROGRAMACION_TEXT).toBe("Esta referencia no tiene programación de atención disponible. Elige otra.");
    expect(referenciaBloqueadaAviso(aceptada, sinProgramacion)).toBe(REFERENCIA_SIN_PROGRAMACION_TEXT);
    expect(referenciaBloqueadaAviso(pendiente, sinProgramacion)).toBe(referenciaBloqueadaText("PENDIENTE"));
  });
});
