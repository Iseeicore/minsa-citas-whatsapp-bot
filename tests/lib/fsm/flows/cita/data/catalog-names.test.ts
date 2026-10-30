import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogRowDescription,
  formatEspecialidadName,
  formatEstablecimientoName,
  fullNameFromRow,
  offeredFullName,
  rememberFullNames,
} from "@/lib/fsm/flows/cita/data/catalog-names";
import type { Session } from "@/lib/fsm/core/types";
import { logger } from "@/lib/observability/logger";
import { SlotKey } from "@/lib/enums/slot-key";

describe("formatEspecialidadName", () => {
  it("cleans the real MINSA names: no service prefix, no stray dashes, title case", () => {
    expect(formatEspecialidadName("CONSULTA EXTERNA-MEDICINA GENERAL / ATENCIÓN DEL ADULTO-")).toEqual({
      title: "Medicina General",
      full: "Medicina General / Atención del Adulto",
    });
    expect(formatEspecialidadName("CONSULTA EXTERNA-ODONTOLOGÍA GENERAL-")).toEqual({
      title: "Odontología General",
      full: "Odontología General",
    });
  });

  it("works on a name without the service prefix or without a slash", () => {
    expect(formatEspecialidadName("PEDIATRIA")).toEqual({ title: "Pediatria", full: "Pediatria" });
    expect(formatEspecialidadName("  CONSULTA  EXTERNA - CARDIOLOGIA  ")).toEqual({ title: "Cardiologia", full: "Cardiologia" });
  });

  it("cuts a title longer than 24 characters at a word boundary", () => {
    const { title, full } = formatEspecialidadName("CONSULTA EXTERNA-MEDICINA FISICA Y REHABILITACION INTEGRAL-");
    expect(full).toBe("Medicina Fisica y Rehabilitacion Integral");
    expect(title).toBe("Medicina Fisica y");
    expect(title.length).toBeLessThanOrEqual(24);
  });
});

describe("formatEstablecimientoName", () => {
  it.each([
    ["HOSPITAL NACIONAL HIPOLITO UNANUE", "Hosp. Nacional Hipolito", "Hospital Nacional Hipolito Unanue"],
    ["CENTRO DE SALUD SAN FERNANDO", "C.S. San Fernando", "Centro de Salud San Fernando"],
    ["PUESTO DE SALUD LAS PALMERAS", "P.S. las Palmeras", "Puesto de Salud las Palmeras"],
    ["CENTRO MATERNO INFANTIL JUAN PABLO II", "C.M.I. Juan Pablo II", "Centro Materno Infantil Juan Pablo II"],
    ["CS SANTA ANITA", "CS Santa Anita", "CS Santa Anita"],
    ["C.S. SAN FERNANDO", "C.S. San Fernando", "C.S. San Fernando"],
  ])("%s → title %j", (raw, title, full) => {
    const name = formatEstablecimientoName(raw);
    expect(name).toEqual({ title, full });
    expect(name.title.length).toBeLessThanOrEqual(24);
  });
});

describe("catalogRowDescription", () => {
  it("carries the full name and the quota when the title is shortened", () => {
    expect(catalogRowDescription({ title: "Medicina General", full: "Medicina General / Atención del Adulto" }, 1312)).toBe(
      "Medicina General / Atención del Adulto · 1312 cupos",
    );
  });

  it("carries only the quota when the full name fits the title", () => {
    expect(catalogRowDescription({ title: "Odontología General", full: "Odontología General" }, 27)).toBe("27 cupos");
    expect(catalogRowDescription({ title: "Pediatria", full: "Pediatria" }, 1)).toBe("1 cupo");
  });

  it("never passes 72 characters and keeps the quota visible", () => {
    const full = "Medicina General / Atención Integral del Adulto Mayor con Enfermedades Crónicas";
    const description = catalogRowDescription({ title: "Medicina General", full }, 1312);
    expect(description.length).toBeLessThanOrEqual(72);
    expect(description.endsWith(" · 1312 cupos")).toBe(true);
  });
});

describe("fullNameFromRow", () => {
  it("reads the full name back from a row built with catalogRowDescription", () => {
    const name = { title: "Medicina General", full: "Medicina General / Atención del Adulto" };
    expect(fullNameFromRow({ id: "1", title: name.title, description: catalogRowDescription(name, 5) })).toBe(name.full);
    expect(
      fullNameFromRow({ id: "2", title: "Pediatria", description: catalogRowDescription({ title: "Pediatria", full: "Pediatria" }, 5) }),
    ).toBe("Pediatria");
  });
});

describe("offeredFullName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa el nombre completo guardado para la fila", () => {
    const slots: Session["slots"] = {};
    rememberFullNames(slots, [{ id: "02", full: "Medicina General / Atención del Adulto" }]);

    expect(offeredFullName(slots, { id: "02", title: "Medicina General" })).toBe("Medicina General / Atención del Adulto");
  });

  it("con el slot dañado lo registra y usa el nombre de la fila", () => {
    const warn = vi.spyOn(logger, "warn");

    expect(offeredFullName({ [SlotKey.CITA_OFFERED_NAMES]: "[1," }, { id: "02", title: "Medicina General" })).toBe("Medicina General");
    expect(warn).toHaveBeenCalledWith("session.slot_corrupt", { slot: SlotKey.CITA_OFFERED_NAMES });
  });
});
