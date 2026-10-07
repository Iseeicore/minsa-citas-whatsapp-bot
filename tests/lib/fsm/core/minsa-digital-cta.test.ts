import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMinsaDigitalCta } from "@/lib/fsm/core/minsa-digital-cta";

const PORTAL = "https://portal-prueba.example.test";
const TEXT = "Continúa tu cita en MINSA Digital.";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendMinsaDigitalCta", () => {
  it("con la variable definida arma el botón con el enlace de la ruta pedida", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    expect(sendMinsaDigitalCta(TEXT, "Ir a MINSADIGITAL", "/login")).toEqual({
      kind: "send_cta_url",
      text: TEXT,
      buttonText: "Ir a MINSADIGITAL",
      url: `${PORTAL}/login`,
    });
  });

  it("sin ruta apunta a la raíz del portal configurado", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", `${PORTAL}/`);

    expect(sendMinsaDigitalCta(TEXT, "Abrir")).toMatchObject({ kind: "send_cta_url", url: PORTAL });
  });

  it("sin la variable envía el mismo texto sin botón, no un enlace roto", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const effect = sendMinsaDigitalCta(TEXT, "Ir a MINSADIGITAL", "/login");

    expect(effect).toEqual({ kind: "send_text", text: TEXT });
    expect(effect).not.toHaveProperty("url");
    expect(effect).not.toHaveProperty("buttonText");
  });
});
