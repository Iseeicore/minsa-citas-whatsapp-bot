import { describe, expect, it } from "vitest";
import { detectExitIntent } from "@/lib/fsm/parsing/exit-intent";

describe("detectExitIntent", () => {
  it.each([
    "quiero salir",
    "Quiero salir de aquí",
    "salir",
    "ya no quiero",
    "ya no quiero nada",
    "no quiero nada",
    "no quiero seguir",
    "no quiero continuar",
    "me aburrí",
    "agg me aburriiii",
    "olvídalo",
    "déjalo",
    "déjalo así",
    "cancela la cita",
    "cancelar mi cita",
    "ya no sigo",
    "me cansé",
    "me harté",
  ])("recognises «%s» as wanting to leave", (text) => {
    expect(detectExitIntent(text)).toBe(true);
  });

  it.each([
    "no",
    "No.",
    "cancelar",
    "cancela",
    "sí",
    "Miraflores",
    "San Juan de Lurigancho",
    "Salitre",
    "12345678",
    "no quiero esa fecha",
    "ya no quiero esa, dame otra",
    "quiero salir el lunes temprano",
    "cardiología",
    "",
  ])("does not treat «%s» as wanting to leave", (text) => {
    expect(detectExitIntent(text)).toBe(false);
  });
});
