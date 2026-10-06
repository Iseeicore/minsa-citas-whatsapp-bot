import { afterEach, describe, expect, it, vi } from "vitest";
import { bookAppointment } from "@/lib/integrations/minsa/booking";

const PORTAL = "https://portal-prueba.example.test";

const params = {
  codigoRenipress: "6181",
  codigoUps: "222400",
  fechaCita: "20260923",
  horaCita: "1115",
  numeroDocumentoPaciente: "12345678",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bookAppointment en modo simulado", () => {
  it("el enlace de confirmación sigue al portal configurado", async () => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "false");
    vi.stubEnv("MINSA_DIGITAL_APP_URL", `${PORTAL}/`);

    await expect(bookAppointment(params, "token")).resolves.toEqual({
      status: "booked",
      url: `${PORTAL}/citas/confirmacion/FAKE123`,
      message: "Cita registrada correctamente",
    });
  });

  it("sin la variable no inventa un dominio: el enlace queda vacío", async () => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "false");
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    await expect(bookAppointment(params, "token")).resolves.toEqual({
      status: "booked",
      url: "",
      message: "Cita registrada correctamente",
    });
  });
});
