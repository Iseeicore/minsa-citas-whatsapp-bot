import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { nationalRedirectText, redirectToNationalSite } from "@/lib/fsm/flows/cita/pilot-scope";
import type { HandlerResult, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";

const FROM = "wa-link";
const PORTAL = "https://portal-prueba.example.test";

afterEach(() => {
  vi.unstubAllEnvs();
});

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const kinds = (result: HandlerResult): string[] => sent(result).map((effect) => effect.kind);

const base: Session = { state: "cita_validate_pending", slots: { [SlotKey.CITA_DNI_PENDING]: "12345678" }, counters: {} };

describe("salto a MINSA Digital desde el alcance del piloto", () => {
  it("con la variable definida el botón apunta a /login del portal configurado", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    const result = redirectToNationalSite(base);

    expect(sent(result)[0]).toEqual({
      kind: "send_cta_url",
      text: nationalRedirectText(),
      buttonText: "Cita Nivel Global",
      url: `${PORTAL}/login`,
    });
  });

  it("sin la variable el mismo mensaje sale como texto, sin botón roto", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const result = redirectToNationalSite(base);

    expect(sent(result)).toEqual([{ kind: "send_text", text: nationalRedirectText() }]);
    expect(result.session.state).toBe("cita_national_redirect");
  });
});

describe("registro en MINSA Digital cuando el documento no se encuentra", () => {
  const notValid: QueryResultEvent = { from: FROM, type: "query_result", queryKind: "validate_user", result: { status: "not_valid" } };
  const firstAttempt: Session = { ...base, counters: { [CounterKey.CITA_REGISTRATION_CHECKS]: 0 } };

  it("con la variable definida ofrece el botón hacia /login del portal configurado", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    const result = handle(firstAttempt, notValid);

    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url", buttonText: "Ir a MINSADIGITAL", url: `${PORTAL}/login` });
    expect(kinds(result)).toEqual(["send_cta_url", "send_buttons"]);
  });

  it("sin la variable conserva el texto y los botones de reintento, pero sin enlace", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const result = handle(firstAttempt, notValid);

    expect(kinds(result)).toEqual(["send_text", "send_buttons"]);
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("Todavía no encontramos tu registro") });
    expect(sent(result)[0]).not.toHaveProperty("url");
  });
});

describe("constancia de la cita reservada", () => {
  const booking: Session = { state: "cita_booking_pending", slots: { [SlotKey.CITA_BEARER]: "token" }, counters: {} };
  const booked = (url: string): QueryResultEvent => ({
    from: FROM,
    type: "query_result",
    queryKind: "book_appointment",
    result: { status: "booked", url, message: "Cita creada" },
  });

  it("con enlace ofrece el botón «Ver mi cita»", () => {
    const result = handle(booking, booked(`${PORTAL}/citas/confirmacion/ABC`));

    expect(kinds(result)).toEqual(["send_text", "send_cta_url", "send_text"]);
    expect(sent(result)[1]).toMatchObject({ buttonText: "Ver mi cita", url: `${PORTAL}/citas/confirmacion/ABC` });
  });

  it("sin enlace manda el mismo aviso como texto, no un botón con la URL vacía", () => {
    const result = handle(booking, booked(""));

    expect(kinds(result)).toEqual(["send_text", "send_text", "send_text"]);
    expect(sent(result)[1]).toEqual({
      kind: "send_text",
      text: "Ingrese a la plataforma oficial para visualizar los detalles de su atención (establecimiento, fecha, hora y consultorio):",
    });
    expect(result.session.state).toBe("cita_booked");
  });
});
