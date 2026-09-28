import { describe, expect, it } from "vitest";
import { INVALID_DOCUMENT_TEXT, TURN_FAILURE_TEXT, searchFailureText } from "@/lib/fsm/core/failure-texts";
import { TURN_FAILURE_TEXT as TURN_FAILURE_TEXT_FROM_LOCK } from "@/lib/fsm/session/turn-lock";

describe("failure texts sent to the citizen", () => {
  it("keeps every text byte for byte as it was before the catalog", () => {
    expect(TURN_FAILURE_TEXT).toBe(
      "Ocurrió un inconveniente temporal al procesar tu solicitud. Por favor, intenta escribir nuevamente en unos instantes.",
    );
    expect(INVALID_DOCUMENT_TEXT).toBe("Documento inválido. Debe tener 8 dígitos. Intenta de nuevo.");
    expect(searchFailureText("especialidades")).toBe(
      "Ocurrió un error al buscar especialidades disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
    );
    expect(searchFailureText("establecimientos")).toBe(
      "Ocurrió un error al buscar establecimientos disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
    );
    expect(searchFailureText("fechas")).toBe(
      "Ocurrió un error al buscar fechas disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
    );
    expect(searchFailureText("horarios")).toBe(
      "Ocurrió un error al buscar horarios disponibles. Intenta iniciar tu cita nuevamente en unos minutos.",
    );
  });

  it("is still reachable from the turn lock module, the same text", () => {
    expect(TURN_FAILURE_TEXT_FROM_LOCK).toBe(TURN_FAILURE_TEXT);
  });
});
