import { afterEach, describe, expect, it, vi } from "vitest";
import { isQueryEffect } from "@/lib/fsm/core/handlers-shared";
import {
  allowedDepartamentos,
  isAllowedDepartamento,
  nationalRedirectText,
} from "@/lib/fsm/flows/cita/pilot-scope";
import { resolveDistritoCandidates } from "@/lib/fsm/flows/cita/distrito-resolver";
import { handleUbigeoPending } from "@/lib/fsm/flows/cita/steps/ubigeo";
import { extractCitaHints } from "@/lib/fsm/flows/cita/cita-hints";
import type { HandlerResult, QueryResultEvent, SendEffect, Session } from "@/lib/fsm/core/types";

const LIMA_ONLY_TEXT =
  "Por el momento el agendamiento automático por este canal solo está disponible en Lima. Para tu distrito, continúa tu cita a nivel nacional en MINSA Digital.";

const sent = (result: HandlerResult): SendEffect[] =>
  result.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));

const session = (state: string): Session => ({ state, slots: { citaBearer: "token" }, counters: {} });

const arequipa = { departamento: "AREQUIPA", provincia: "AREQUIPA", distrito: "MIRAFLORES" };
const lima = { departamento: "LIMA", provincia: "LIMA", distrito: "MIRAFLORES" };

const ubigeoFound = (items: Array<typeof arequipa & { ubigeoInei: string }>): QueryResultEvent => ({
  from: "wa-1",
  type: "query_result",
  queryKind: "search_ubigeo",
  result: { status: "found", items },
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CITA_ALLOWED_DEPARTAMENTOS", () => {
  it("unset or empty turns the filter off: every departamento is allowed", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", undefined as unknown as string);
    delete process.env.CITA_ALLOWED_DEPARTAMENTOS;
    expect(allowedDepartamentos()).toEqual([]);
    expect(isAllowedDepartamento("Arequipa")).toBe(true);

    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "");
    expect(allowedDepartamentos()).toEqual([]);
    expect(isAllowedDepartamento("Cusco")).toBe(true);
  });

  it("reads a comma list, normalized", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", " lima, Callao ,Árequipa ,");
    expect(allowedDepartamentos()).toEqual(["LIMA", "CALLAO", "AREQUIPA"]);
    expect(isAllowedDepartamento("Lima")).toBe(true);
    expect(isAllowedDepartamento("AREQUIPA")).toBe(true);
    expect(isAllowedDepartamento("Cusco")).toBe(false);
  });

  it("the redirect text stays word for word the same for LIMA and names the configured departamentos otherwise", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
    expect(nationalRedirectText()).toBe(LIMA_ONLY_TEXT);

    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA,CALLAO");
    expect(nationalRedirectText()).toBe(LIMA_ONLY_TEXT.replace("en Lima.", "en Lima y Callao."));

    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA,CALLAO,AREQUIPA");
    expect(nationalRedirectText()).toBe(LIMA_ONLY_TEXT.replace("en Lima.", "en Lima, Callao y Arequipa."));
  });
});

describe("the district search honors the configured scope", () => {
  it("with LIMA, a district only found outside Lima is redirected to MINSA Digital", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
    const result = resolveDistritoCandidates(session("cita_distrito_ai_pending"), [arequipa]);

    expect(result.session.state).toBe("cita_national_redirect");
    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url", text: LIMA_ONLY_TEXT });
  });

  it("with the filter off, the same district continues to the ubigeo search", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "");
    const result = resolveDistritoCandidates(session("cita_distrito_ai_pending"), [arequipa]);

    expect(result.session.state).toBe("cita_ubigeo_pending");
  });

  it("with LIMA and a candidate in each departamento, only the Lima one is kept", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
    const result = resolveDistritoCandidates(session("cita_distrito_ai_pending"), [arequipa, lima]);

    expect(result.session.state).toBe("cita_ubigeo_pending");
    expect(result.session.slots.citaDepartamento).toBe("LIMA");
  });

  it("the first-message district hint follows the same scope", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
    expect(extractCitaHints("quiero una cita en cayma").distrito).toBeUndefined();

    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "");
    expect(extractCitaHints("quiero una cita en cayma").distrito).toBe("Cayma");
  });
});

describe("the manual mode (departamento → provincia → distrito) also honors the scope", () => {
  const arequipaUbigeo = { ...arequipa, ubigeoInei: "040114" };

  it("with LIMA, a ubigeo outside Lima is redirected instead of continuing", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "LIMA");
    const result = handleUbigeoPending(session("cita_ubigeo_pending"), ubigeoFound([arequipaUbigeo]));

    expect(result.session.state).toBe("cita_national_redirect");
    expect(sent(result)[0]).toMatchObject({ kind: "send_cta_url", text: LIMA_ONLY_TEXT });
  });

  it("with the filter off, the same ubigeo continues to the especialidades", () => {
    vi.stubEnv("CITA_ALLOWED_DEPARTAMENTOS", "");
    const result = handleUbigeoPending(session("cita_ubigeo_pending"), ubigeoFound([arequipaUbigeo]));

    expect(result.session.state).toBe("cita_especialidad_pending");
    expect(result.session.slots.citaUbigeo).toBe("040114");
  });
});
