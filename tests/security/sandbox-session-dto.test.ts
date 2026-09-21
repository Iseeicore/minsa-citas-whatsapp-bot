import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => true),
  resetSession: vi.fn(async () => undefined),
  resetAll: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: {
      state: "cita_awaiting_distrito_ai",
      slots: {
        // Credenciales y datos personales que la FSM guarda de verdad:
        // handlers-cita.ts pone el bearer y el DNI apenas se verifica el OTP,
        // y el flujo de reclamo guarda nombre, queja y la foto en base64.
        citaBearer: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.firma",
        citaDni: "12345678",
        citaDniPending: "12345678",
        citaTwofaId: "2fa-abc",
        dni: "12345678",
        nombre: "Ana",
        nombreCompleto: "Ana Pérez",
        queja: "Me atendieron mal en la posta",
        mediaDataUri: "data:image/png;base64,AAAA",
        // Datos de navegación que el ciudadano ya ve en su propia conversación.
        citaDistrito: "SAN BORJA",
        citaFecha: "22/09/2026",
        citaUbigeo: "150101",
      },
      counters: { citaOtpAttempts: 1 },
    },
  })),
}));

vi.mock("@/lib/fsm/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
  resetAllSandboxTestSessions: mocks.resetAll,
}));
vi.mock("@/lib/fsm/executor", () => ({ runTurn: mocks.runTurn }));

import { POST } from "@/app/api/sandbox/route";

// El token que la FSM obtiene tras el OTP permite actuar como el ciudadano
// contra la API de citas de MINSA. La respuesta HTTP lo estaba mandando entero
// al navegador (y el widget lo escribía en localStorage, legible por cualquier
// JS del origen). Nada de esto puede cruzar el borde HTTP.
const CREDENCIALES = ["citaBearer", "citaDni", "citaDniPending", "citaTwofaId"];
const DATOS_PERSONALES = ["dni", "nombre", "nombreCompleto", "queja", "mediaDataUri"];

async function responderTurno() {
  const request = new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "web-qa", type: "text", text: "hola" }),
  });
  const response = await POST(request);
  return (await response.json()) as {
    session: { state: string; slots: Record<string, unknown>; counters: Record<string, number> };
  };
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  vi.clearAllMocks();
  mocks.sessionRowExists.mockResolvedValue(true);
});

describe("la respuesta del sandbox nunca expone credenciales ni datos personales", () => {
  it.each(CREDENCIALES)("no devuelve %s", async (clave) => {
    const { session } = await responderTurno();

    expect(session.slots).not.toHaveProperty(clave);
  });

  it.each(DATOS_PERSONALES)("no devuelve %s", async (clave) => {
    const { session } = await responderTurno();

    expect(session.slots).not.toHaveProperty(clave);
  });

  it("el token no aparece en ninguna parte del cuerpo, ni siquiera anidado", async () => {
    const { session } = await responderTurno();

    expect(JSON.stringify(session)).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("sí devuelve el estado, que es lo único que el widget necesita", async () => {
    const { session } = await responderTurno();

    expect(session.state).toBe("cita_awaiting_distrito_ai");
  });

  it("sí devuelve los datos de navegación que el ciudadano ya ve en su conversación", async () => {
    const { session } = await responderTurno();

    expect(session.slots).toMatchObject({
      citaDistrito: "SAN BORJA",
      citaFecha: "22/09/2026",
      citaUbigeo: "150101",
    });
  });

  it("un slot nuevo que nadie agregó a la allowlist NO se expone (falla cerrado)", async () => {
    mocks.runTurn.mockResolvedValueOnce({
      sent: [],
      session: { state: "main_menu", slots: { citaTokenNuevoDeMañana: "secreto" }, counters: {} },
    } as never);

    const { session } = await responderTurno();

    expect(session.slots).not.toHaveProperty("citaTokenNuevoDeMañana");
  });
});
