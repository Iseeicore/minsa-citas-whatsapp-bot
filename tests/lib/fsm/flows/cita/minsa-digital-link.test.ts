import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "@/lib/fsm/core/handlers";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import { nationalRedirectText, redirectToNationalSite } from "@/lib/fsm/flows/cita/pilot-scope";
import type { HandlerResult, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";
import { CounterKey } from "@/lib/enums/counter-key";
import { SlotKey } from "@/lib/enums/slot-key";
import { InternalEventType } from "@/lib/enums/internal-event-type";
import { CITA_BOOKED_FAREWELL_TEXT } from "@/lib/constants/textos/cita-salida";

const FROM = "wa-link";
const PORTAL = "https://portal-prueba.example.test";

afterEach(() => {
  vi.unstubAllEnvs();
});

const sent = (result: HandlerResult): SendEffect[] => result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

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
  const notValid: QueryResultEvent = {
    channel: "whatsapp",
    from: FROM,
    type: InternalEventType.QUERY_RESULT,
    queryKind: "validate_user",
    result: { status: "not_valid" },
  };
  const firstAttempt: Session = { ...base, counters: { [CounterKey.CITA_REGISTRATION_CHECKS]: 0 } };

  it("con la variable definida ofrece el botón hacia /login del portal configurado", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", PORTAL);

    const result = handle(firstAttempt, notValid);

    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url", buttonText: "Ir a MINSA RESPONDE", url: `${PORTAL}/login` });
    expect(kinds(result)).toEqual(["send_cta_url", "send_buttons"]);
  });

  it("sin la variable conserva el texto y los botones de reintento, pero sin enlace", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const result = handle(firstAttempt, notValid);

    expect(kinds(result)).toEqual(["send_text", "send_buttons"]);
    expect(sent(result)[0]).toMatchObject({ text: expect.stringContaining("No encontramos tu documento en MINSA Responde") });
    expect(sent(result)[0]).not.toHaveProperty("url");
  });
});

describe("constancia de la cita reservada", () => {
  const booking: Session = { state: "cita_booking_pending", slots: { [SlotKey.CITA_BEARER]: "token" }, counters: {} };
  const booked = (url: string): QueryResultEvent => ({
    channel: "whatsapp",
    from: FROM,
    type: InternalEventType.QUERY_RESULT,
    queryKind: "book_appointment",
    result: { status: "booked", url, message: "Cita creada" },
  });

  it("con enlace manda dos mensajes: la constancia y el botón «Ver mi cita» con la despedida", () => {
    const result = handle(booking, booked(`${PORTAL}/citas/confirmacion/ABC`));

    expect(kinds(result)).toEqual(["send_text", "send_cta_url"]);
    expect(sent(result)[0]).toEqual({
      kind: "send_text",
      text: [
        "*MINISTERIO DE SALUD DEL PERÚ*",
        "*Constancia de Registro de Cita*",
        "",
        "Estimado(a) usuario(a), su solicitud ha sido procesada con éxito:",
        "*Cita creada*",
        "",
        "*Nota:* Recuerde acudir a su cita portando su DNI o documento de identidad físico e intente llegar 15 minutos antes.",
      ].join("\n"),
    });
    expect(sent(result)[1]).toEqual({
      kind: "send_cta_url",
      text: [
        "Si desea ver el PDF de su cita, dé clic en *Ver mi cita*.",
        "",
        "Gracias por comunicarte con el *Ministerio de Salud del Perú*. Si necesitas agendar otra cita, escríbenos nuevamente. ¡Que tengas un buen día! 👋",
      ].join("\n"),
      buttonText: "Ver mi cita",
      url: `${PORTAL}/citas/confirmacion/ABC`,
    });
  });

  it("sin enlace manda la constancia y solo la despedida, no un botón con la URL vacía", () => {
    const result = handle(booking, booked(""));

    expect(kinds(result)).toEqual(["send_text", "send_text"]);
    expect(sent(result)[1]).toEqual({ kind: "send_text", text: CITA_BOOKED_FAREWELL_TEXT });
    expect(result.session.state).toBe("cita_booked");
  });
});
