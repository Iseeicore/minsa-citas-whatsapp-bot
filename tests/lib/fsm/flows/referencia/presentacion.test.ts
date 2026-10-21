import { describe, expect, it } from "vitest";
import { esReferenciaAgendable, ordenarReferencias, presentarReferencia, referenciaRows } from "@/lib/fsm/flows/referencia/presentacion";
import type { ReferenciaItem } from "@/lib/integrations/minsa/types";
import { ReferenciaTono } from "@/lib/enums/referencia-tono";
import { WHATSAPP_ROW_DESCRIPTION_MAX, WHATSAPP_ROW_TITLE_MAX } from "@/lib/constants/limits/whatsapp";

const BASE: ReferenciaItem = {
  idReferencia: "ksbLbKT9MVfb",
  numero: "05006",
  fechaInicio: "25/04/2017 12:32",
  ipressOrigen: "CENTRO DE SALUD SAN GENARO DE VILLA",
  ipressDestino: "HOSPITAL MARIA AUXILIADORA",
  upsOrigen: "CONSULTA EXTERNA",
  upsDestino: "CONSULTA EXTERNA",
  codigoIpressDestino: "5987",
  codigoUpsDestino: "220000",
  estado: 7,
  estadoDescripcion: "PACIENTE CITADO",
};

const DERIVACION = "Centro de Salud San Genaro de Villa te derivó por Consulta Externa a Hospital Maria Auxiliadora.";

const conEstado = (estado: number, estadoDescripcion?: string, extra: Partial<ReferenciaItem> = {}): ReferenciaItem => ({
  ...BASE,
  estado,
  estadoDescripcion,
  ...extra,
});

describe("presentarReferencia — estados que permiten agendar", () => {
  it.each([
    [3, "ACEPTADO", "Aceptado", ReferenciaTono.EXITO, `${DERIVACION} Tu referencia fue aceptada; puedes agendar tu cita.`],
    [
      5,
      "PACIENTE RECIBIDO",
      "Paciente recibido",
      ReferenciaTono.EXITO,
      `${DERIVACION} Tu referencia está vigente; puedes agendar tu cita.`,
    ],
    [
      7,
      "PACIENTE CITADO",
      "Paciente citado",
      ReferenciaTono.INFO,
      `${DERIVACION} Tu referencia está vigente; puedes agendar una nueva cita.`,
    ],
  ])("estado %i (%s) se presenta como «%s»", (estado, descripcion, etiqueta, tono, mensaje) => {
    const vista = presentarReferencia(conEstado(estado, descripcion));

    expect(vista).toMatchObject({ etiqueta, tono, agendable: true, mensaje });
    expect(esReferenciaAgendable(conEstado(estado, descripcion))).toBe(true);
  });
});

describe("presentarReferencia — cualquier otro estado", () => {
  it("usa la descripción de MINSA con mayúscula inicial, tono neutro y no permite agendar", () => {
    const vista = presentarReferencia(conEstado(1, "REGISTRADO"));

    expect(vista).toMatchObject({
      etiqueta: "Registrado",
      tono: ReferenciaTono.NEUTRO,
      agendable: false,
      mensaje: `${DERIVACION} Por su estado (Registrado), esta referencia no permite agendar una cita.`,
    });
    expect(esReferenciaAgendable(conEstado(1, "REGISTRADO"))).toBe(false);
  });

  it("una descripción de varias palabras queda en formato de título", () => {
    expect(presentarReferencia(conEstado(9, "NO PERTINENTE")).etiqueta).toBe("No Pertinente");
  });

  it("sin descripción (sesión guardada antes del cambio) no deja un estado vacío", () => {
    const vista = presentarReferencia(conEstado(2, undefined));

    expect(vista.etiqueta).not.toBe("");
    expect(vista.mensaje).not.toContain("()");
    expect(vista.agendable).toBe(false);
  });
});

describe("presentarReferencia — origen sin UPS", () => {
  it("omite el «por» y no deja espacios dobles", () => {
    const vista = presentarReferencia(conEstado(3, "ACEPTADO", { upsOrigen: "" }));

    expect(vista.mensaje).toBe(
      "Centro de Salud San Genaro de Villa te derivó a Hospital Maria Auxiliadora. Tu referencia fue aceptada; puedes agendar tu cita.",
    );
    expect(vista.mensaje).not.toContain("  ");
  });
});

describe("referenciaRows", () => {
  it("fila de ejemplo: el destino abreviado como título y estado, número y fecha como descripción", () => {
    expect(referenciaRows([BASE])).toEqual([
      {
        id: "ksbLbKT9MVfb",
        title: "Hosp. Maria Auxiliadora",
        description: "Paciente citado · N° 05006 · 25/04/2017",
        tone: ReferenciaTono.INFO,
      },
    ]);
  });

  it("una referencia que no permite agendar sale deshabilitada y con tono neutro", () => {
    const [row] = referenciaRows([conEstado(1, "REGISTRADO", { idReferencia: "r1" })]);

    expect(row).toEqual({
      id: "r1",
      title: "Hosp. Maria Auxiliadora",
      description: "Registrado · N° 05006 · 25/04/2017",
      tone: ReferenciaTono.NEUTRO,
      disabled: true,
    });
  });

  it("primero las que permiten agendar y, dentro de cada grupo, la más reciente primero", () => {
    const items = [
      conEstado(1, "REGISTRADO", { idReferencia: "bloqueada-nueva", fechaInicio: "01/01/2024 08:00" }),
      conEstado(5, "PACIENTE RECIBIDO", { idReferencia: "agendable-vieja", fechaInicio: "03/03/2018 09:45" }),
      conEstado(2, "PENDIENTE", { idReferencia: "bloqueada-vieja", fechaInicio: "15/06/2019 11:02" }),
      conEstado(3, "ACEPTADO", { idReferencia: "agendable-nueva", fechaInicio: "20/01/2020 16:30" }),
      conEstado(7, "PACIENTE CITADO", { idReferencia: "agendable-mismo-dia", fechaInicio: "20/01/2020 09:00" }),
    ];

    expect(referenciaRows(items).map((row) => row.id)).toEqual([
      "agendable-nueva",
      "agendable-mismo-dia",
      "agendable-vieja",
      "bloqueada-nueva",
      "bloqueada-vieja",
    ]);
  });

  it("una fecha que no se puede leer va al final de su grupo", () => {
    const items = [
      conEstado(3, "ACEPTADO", { idReferencia: "sin-fecha", fechaInicio: "" }),
      conEstado(3, "ACEPTADO", { idReferencia: "con-fecha", fechaInicio: "20/01/2020 16:30" }),
    ];

    expect(ordenarReferencias(items).map((item) => item.idReferencia)).toEqual(["con-fecha", "sin-fecha"]);
  });

  it("puede pedir solo las que permiten agendar", () => {
    const items = [conEstado(1, "REGISTRADO", { idReferencia: "bloqueada" }), conEstado(3, "ACEPTADO", { idReferencia: "agendable" })];

    expect(referenciaRows(items, { soloAgendables: true }).map((row) => row.id)).toEqual(["agendable"]);
  });

  it("nombres largos respetan los 24 caracteres del título y los 72 de la descripción", () => {
    const largo = conEstado(4, "REFERENCIA OBSERVADA POR EL ESTABLECIMIENTO DE DESTINO PENDIENTE DE SUBSANAR", {
      ipressDestino: "HOSPITAL NACIONAL DOCENTE MADRE NIÑO SAN BARTOLOME DE LIMA",
      numero: "0000000000123456",
    });

    for (const row of referenciaRows([largo, BASE])) {
      expect(row.title.length).toBeLessThanOrEqual(WHATSAPP_ROW_TITLE_MAX);
      expect((row.description ?? "").length).toBeLessThanOrEqual(WHATSAPP_ROW_DESCRIPTION_MAX);
    }
  });
});

describe("presentarReferencia — detalle para la confirmación", () => {
  it("lleva los datos con mayúscula inicial y la fecha con la hora en 12 horas", () => {
    expect(presentarReferencia(BASE).detalle).toEqual({
      numero: "05006",
      fecha: "25/04/2017 12:32 PM",
      origen: "Centro de Salud San Genaro de Villa",
      upsOrigen: "Consulta Externa",
      destino: "Hospital Maria Auxiliadora",
      upsDestino: "Consulta Externa",
      estado: "Paciente citado",
      mensaje: `${DERIVACION} Tu referencia está vigente; puedes agendar una nueva cita.`,
    });
  });
});
