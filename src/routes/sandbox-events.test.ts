import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { createSandboxDeps } from "../composition/create-sandbox-deps.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";
import { createSession, withState } from "../domain/conversation-session.js";
import type { WebhookIngestionService } from "../services/webhook-ingestion.js";

type TestApp = Awaited<ReturnType<typeof import("../app.js")["buildApp"]>>;

// Fake ingestion service: sandbox tests exercise the REAL buildApp
// composition path (D33/D37), so the webhook ingestion service is a plain
// vi.fn fake that no sandbox request ever invokes.
function fakeIngestion(ingest: ReturnType<typeof vi.fn>): WebhookIngestionService {
  return { ingest };
}

// SBX-6: config reads process.env at module scope (import time), so the gate
// cannot be flipped after a static import of app.ts. Every build goes through
// buildWithEnv (design §6): vi.resetModules() + env pinned BEFORE the dynamic
// import — same app.inject() pattern as app.test.ts, but with a fresh module
// registry per build. GATE_ENV_KEYS are the only two vars the gate reads;
// they are restored after each test so no row leaks env state.
const GATE_ENV_KEYS = ["SANDBOX_ENABLED", "NODE_ENV"] as const;

const SANDBOX_FROM = "51999123456";

let restoreEnv: (() => void) | undefined;

function pinEnv(env: Record<string, string | undefined>): void {
  const previous = new Map<string, string | undefined>();
  for (const key of GATE_ENV_KEYS) {
    previous.set(key, process.env[key]);
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  restoreEnv = () => {
    for (const key of GATE_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    restoreEnv = undefined;
  };
}

async function buildWithEnv(env: Record<string, string | undefined>): Promise<TestApp> {
  vi.resetModules();
  pinEnv(env);
  const { buildApp } = await import("../app.js");
  return buildApp({ logger, ingestion: fakeIngestion(vi.fn()) });
}

afterEach(() => {
  restoreEnv?.();
});

async function postJson(app: TestApp, payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/sandbox/events",
    headers: { "content-type": "application/json" },
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

async function postSandbox(payload: unknown) {
  const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });
  return postJson(app, payload);
}

describe("sandbox gate (SBX-6) — fail-closed registration inside buildApp", () => {
  it("SANDBOX_ENABLED unset -> 404 (route never registered)", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: undefined, NODE_ENV: undefined });
    const response = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Not Found");
  });

  it('SANDBOX_ENABLED="false" -> 404 (route never registered)', async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "false" });
    const response = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Not Found");
  });

  it('SANDBOX_ENABLED="true" + NODE_ENV=production -> 404 (production composition untouched)', async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "production" });
    const response = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Not Found");
  });

  it('SANDBOX_ENABLED="true" + NODE_ENV=development -> registered (200 on valid body, 400 on missing from)', async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    const valid = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });
    expect(valid.statusCode).toBe(200);

    const invalid = await postJson(app, { type: "text", text: "hi" });
    expect(invalid.statusCode).toBe(400);
  });
});

describe("sandbox validation (D38) — 400 invalid_request before any session I/O", () => {
  it("missing from -> 400 invalid_request", async () => {
    const response = await postSandbox({ type: "text", text: "hi" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("empty from -> 400 invalid_request", async () => {
    const response = await postSandbox({ from: "", type: "text", text: "hi" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("whitespace-only from -> 400 invalid_request (trimmed non-empty rule)", async () => {
    const response = await postSandbox({ from: "   ", type: "text", text: "hi" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("unsupported type -> 400 invalid_request", async () => {
    const response = await postSandbox({ from: SANDBOX_FROM, type: "audio" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("null body -> 400 invalid_request (body must be a non-null plain object)", async () => {
    const response = await postSandbox(null);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("array body -> 400 invalid_request (body must be a plain object)", async () => {
    const response = await postSandbox([{ from: SANDBOX_FROM }]);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_request" });
  });

  it("malformed JSON -> 400 malformed_payload via the shared parser", async () => {
    const response = await postSandbox("{not-json");

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("malformed_payload");
  });
});

describe("sandbox one-turn happy path — the route handles a single message turn (SBX-1)", () => {
  it("text at main menu -> one interactive-list send with MAIN_MENU_OPTIONS, state main_menu", async () => {
    const response = await postSandbox({ from: SANDBOX_FROM, type: "text", text: "hola" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sent).toHaveLength(1);
    expect(body.sent[0].kind).toBe("interactive_list");
    expect(body.sent[0].to).toBe(SANDBOX_FROM);
    expect(body.sent[0].list.body).toBe("¿En qué podemos ayudarte hoy?");
    expect(body.sent[0].list.buttonLabel).toBe("Ver opciones");
    expect(body.sent[0].list.sections).toEqual([
      {
        rows: [
          { id: "agendar_cita", title: "Agendar cita" },
          { id: "registrar_reclamo", title: "Registrar un reclamo" },
        ],
      },
    ]);
    expect(body.session.state).toBe("main_menu");
    expect(body.session.slots).toEqual({});
    expect(body.session.counters).toEqual({ messagesSent: 1, messagesReceived: 1, invalidAttempts: 1 });
  });

  it("menu tap via listId -> one buttons send with the identity-choice prompt, state reclamo_identity_choice", async () => {
    const response = await postSandbox({ from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sent).toHaveLength(1);
    expect(body.sent[0].kind).toBe("buttons");
    expect(body.sent[0].to).toBe(SANDBOX_FROM);
    expect(body.sent[0].buttons.body).toBe("¿Deseas identificarte con tu DNI?");
    expect(body.sent[0].buttons.buttons).toEqual([
      { id: "reclamo_con_dni", title: "Sí, tengo DNI" },
      { id: "reclamo_sin_dni", title: "No tengo DNI" },
    ]);
    expect(body.session.state).toBe("reclamo_identity_choice");
  });

  it("button tap via listId after the menu tap -> one text send asking for the DNI, state reclamo_awaiting_dni", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    // Seed the session into the identity-choice state (fresh sessions start
    // at main_menu, where "reclamo_con_dni" is not a menu option).
    await postJson(app, { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });

    const response = await postJson(app, { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sent).toHaveLength(1);
    expect(body.sent[0]).toEqual({ kind: "text", to: SANDBOX_FROM, body: "Ingresa tu DNI (8 dígitos)." });
    expect(body.session.state).toBe("reclamo_awaiting_dni");
  });
});

describe("sandbox session reset (SBX-1) — reset:true deletes before processing", () => {
  it("without reset, a later request resumes the persisted state (no re-zeroing)", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    await postJson(app, { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });
    await postJson(app, { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" });

    const resumed = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });
    expect(resumed.statusCode).toBe(200);
    const body = resumed.json();
    // "hola" is not a valid DNI: the session stays at reclamo_awaiting_dni and
    // invalidAttempts accumulates on the EXISTING session — not a fresh one.
    expect(body.session.state).toBe("reclamo_awaiting_dni");
    expect(body.session.counters).toEqual({ messagesSent: 3, messagesReceived: 3, invalidAttempts: 1 });
  });

  it("reset:true deletes the mid-flow session -> fresh main_menu with zeroed counters", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    await postJson(app, { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });
    await postJson(app, { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" });

    const reset = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola", reset: true });
    expect(reset.statusCode).toBe(200);
    const body = reset.json();
    expect(body.session.state).toBe("main_menu");
    expect(body.session.slots).toEqual({});
    // Zeroed counters for this turn only (1 received + 1 re-prompt send), not
    // the previous session's {received:2, sent:2}.
    expect(body.session.counters).toEqual({ messagesSent: 1, messagesReceived: 1, invalidAttempts: 1 });
  });
});

describe("sandbox capture drain (SBX-2/D36) — each request sees exactly its own sends", () => {
  it("three sequential requests (text/list/button) each report exactly one send, in their own kinds", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    const first = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });
    const second = await postJson(app, { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });
    const third = await postJson(app, { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" });

    expect(first.json().sent).toHaveLength(1);
    expect(first.json().sent[0].kind).toBe("interactive_list");

    expect(second.json().sent).toHaveLength(1);
    expect(second.json().sent[0].kind).toBe("buttons");

    expect(third.json().sent).toHaveLength(1);
    expect(third.json().sent[0].kind).toBe("text");
  });

  it("a second same-session request's sent excludes the first request's sends", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    const first = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });
    const second = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });

    expect(first.json().sent).toHaveLength(1);
    // drain emptied request 1's interactive-list send: request 2 reports only
    // its own single re-prompt send, never a duplicate of request 1's.
    expect(second.json().sent).toHaveLength(1);
    expect(second.json().sent[0].kind).toBe("interactive_list");
    expect(second.json().session.counters.messagesReceived).toBe(2);
  });
});

describe("sandbox E2E journey — reclamo happy path with DNI (spec full scenario, SBX-1)", () => {
  it("7-step OMITIR journey: menu -> con-DNI -> nombre -> descripcion -> OMITIR final-pass -> confirmed", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    // Step 1: "hola" at a fresh main_menu -> interactive-list with both menu rows.
    const step1 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "hola" });
    expect(step1.statusCode).toBe(200);
    expect(step1.json().sent[0].kind).toBe("interactive_list");
    expect(step1.json().sent[0].list.sections[0].rows).toEqual([
      { id: "agendar_cita", title: "Agendar cita" },
      { id: "registrar_reclamo", title: "Registrar un reclamo" },
    ]);
    expect(step1.json().session.state).toBe("main_menu");

    // Step 2: menu tap -> identity-choice buttons.
    const step2 = await postJson(app, { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" });
    expect(step2.statusCode).toBe(200);
    expect(step2.json().sent[0].kind).toBe("buttons");
    expect(step2.json().sent[0].buttons.buttons[0]).toEqual({ id: "reclamo_con_dni", title: "Sí, tengo DNI" });
    expect(step2.json().session.state).toBe("reclamo_identity_choice");

    // Step 3: "Sí, tengo DNI" -> asks for the 8-digit DNI.
    const step3 = await postJson(app, { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" });
    expect(step3.statusCode).toBe(200);
    expect(step3.json().sent).toEqual([{ kind: "text", to: SANDBOX_FROM, body: "Ingresa tu DNI (8 dígitos)." }]);
    expect(step3.json().session.state).toBe("reclamo_awaiting_dni");

    // Step 4: DNI 12345678 -> ONE send, state reclamo_awaiting_nombre.
    //
    // DESIGN-DEVIATION (binding carry-forward): the design's "exactly 5 sends
    // on the DNI turn" signature does NOT match the current FSM — the DNI turn
    // only stores the slot and asks the name; the D20 RENIEC re-entry (the
    // second "verificando" + "describe" pass) happens on the NAME turn instead
    // (reclamoAwaitingDniHandler / reclamoAwaitingNombreHandler). Verified
    // against the real createConversationFlowService: what the FSM actually
    // emits is asserted, per the design's own risk note.
    const step4 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "12345678" });
    expect(step4.statusCode).toBe(200);
    expect(step4.json().sent).toEqual([
      { kind: "text", to: SANDBOX_FROM, body: "Ingresa tus nombres y apellidos, tal como figuran en tu DNI." },
    ]);
    expect(step4.json().session.state).toBe("reclamo_awaiting_nombre");

    // Step 5: full name -> RENIEC verification with D20 re-entry IN THIS TURN:
    // pass 1 emits "verificando" + the reniec_lookup query; pass 2 (fake found
    // + name match) emits the descripcion prompt. Terminal state is
    // reclamo_awaiting_descripcion — the design's "step 5 -> reclamo_awaiting_foto"
    // predates the current FSM's shared descripcion capture state.
    const step5 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "Juan Carlos Quispe" });
    expect(step5.statusCode).toBe(200);
    expect(step5.json().sent).toEqual([
      { kind: "text", to: SANDBOX_FROM, body: "Estamos verificando tus datos…" },
      { kind: "text", to: SANDBOX_FROM, body: "Describe tu reclamo." },
    ]);
    expect(step5.json().session.state).toBe("reclamo_awaiting_descripcion");

    // Step 6: complaint description -> asks for the photo (or OMITIR).
    const step6 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "Se cayó la pared de mi casa" });
    expect(step6.statusCode).toBe(200);
    expect(step6.json().sent).toEqual([{ kind: "text", to: SANDBOX_FROM, body: "Envía una foto o escribe OMITIR." }]);
    expect(step6.json().session.state).toBe("reclamo_awaiting_foto");

    // Step 7 (final pass): OMITIR completes the journey IN ONE TURN — the
    // D20 second pass persists reclamo_confirmed, never reclamo_submit_pending
    // (IMG-1). No further POST at reclamo_confirmed: that would hit the
    // closedFlowHandler and reset to main_menu.
    const step7 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "OMITIR" });
    expect(step7.statusCode).toBe(200);
    expect(step7.json().sent).toEqual([
      { kind: "text", to: SANDBOX_FROM, body: "Registrando tu reclamo…" },
      {
        kind: "text",
        to: SANDBOX_FROM,
        body: "Tu reclamo fue registrado correctamente. Gracias por tu reporte. N° de referencia: DEV-REF-001.",
      },
    ]);
    expect(step7.json().session.state).toBe("reclamo_confirmed");
    // Terminal slots: the four Reclamo keys (dni/nombre/queja/mediaId) are
    // cleared at the terminal transition (D22), but the main-menu selection
    // slot `menuChoice` is NOT reclamo-owned and survives — the design's
    // "slots empty" wording is stale here; the honest FSM leaves exactly
    // { menuChoice }.
    expect(step7.json().session.slots).toEqual({ menuChoice: "registrar_reclamo" });
  });
});

describe("sandbox E2E journey — image-message variant (SBX-1 Image scenario, IMG-1/IMG-2)", () => {
  it("image at reclamo_awaiting_foto -> registration-processing + reference, terminal reclamo_confirmed, data-URI submitted", async () => {
    const app = await buildWithEnv({ SANDBOX_ENABLED: "true", NODE_ENV: "development" });

    // Same shared walk as the happy path, up to the foto state: steps 1-5
    // (menu -> con-DNI -> DNI -> nombre -> descripcion) land the session at
    // reclamo_awaiting_descripcion; step 6 asks for the photo.
    for (const payload of [
      { from: SANDBOX_FROM, type: "text", text: "hola" },
      { from: SANDBOX_FROM, type: "list", listId: "registrar_reclamo" },
      { from: SANDBOX_FROM, type: "button", listId: "reclamo_con_dni" },
      { from: SANDBOX_FROM, type: "text", text: "12345678" },
      { from: SANDBOX_FROM, type: "text", text: "Juan Carlos Quispe" },
    ]) {
      const step = await postJson(app, payload);
      expect(step.statusCode).toBe(200);
    }

    const step6 = await postJson(app, { from: SANDBOX_FROM, type: "text", text: "Se cayó la pared de mi casa" });
    expect(step6.statusCode).toBe(200);
    expect(step6.json().sent.map((send: { body?: string }) => send.body)).toContain("Envía una foto o escribe OMITIR.");
    expect(step6.json().session.state).toBe("reclamo_awaiting_foto");

    // Step 7: the image message. The fake media downloader runs on THIS turn
    // (mediaId branch) and the accepted fake resolves the quejas_submit
    // effect within the same bounded turn: pass 1 sends "Registrando…", pass
    // 2 (D20 re-entry result) sends the reference. The terminal persisted
    // state is reclamo_confirmed — reclamo_submit_pending is mid-turn only
    // and is NEVER persisted (IMG-1).
    const image = await postJson(app, {
      from: SANDBOX_FROM,
      type: "image",
      mediaId: "img_001",
      mediaMimeType: "image/jpeg",
    });
    expect(image.statusCode).toBe(200);
    const body = image.json();
    expect(body.sent).toHaveLength(2);
    expect(body.sent[0]).toEqual({ kind: "text", to: SANDBOX_FROM, body: "Registrando tu reclamo…" });
    expect(body.sent[1].kind).toBe("text");
    expect(body.sent[1].body).toContain("N° de referencia: DEV-REF-001");
    expect(body.session.state).toBe("reclamo_confirmed");
    expect(body.session.slots).toEqual({ menuChoice: "registrar_reclamo" });

    // Payload proof (IMG-2): assert what the FSM actually submitted via the
    // REAL composition root — createSandboxDeps is the exact function
    // buildApp's D33 gate calls, so the seam observes the genuine
    // flow+fakes wiring. The route path cannot expose the composition
    // (SandboxRoutesDeps is { flow, sessionStore, captures } only), so the
    // submitted payload is observed from an equivalent composition seeded at
    // the same reclamo_awaiting_foto state the route journey just reached.
    const sandbox = createSandboxDeps({ config, logger });
    const sessionKey = msisdnDigest(SANDBOX_FROM, config.sessionKeySecret);
    const seeded = withState(
      {
        ...createSession(sessionKey, config.sessionTtlSeconds),
        slots: {
          menuChoice: "registrar_reclamo",
          dni: "12345678",
          nombre: "Juan Carlos Quispe",
          queja: "Se cayó la pared de mi casa",
        },
      },
      "reclamo_awaiting_foto"
    );
    await sandbox.sessionStore.save(seeded);
    await sandbox.flow.process({
      eventId: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      source: "whatsapp",
      from: SANDBOX_FROM,
      messageType: "image",
      mediaId: "img_001",
      mediaMimeType: "image/jpeg",
      raw: {},
    });

    const submitted = sandbox.quejasLog();
    expect(submitted).toHaveLength(1);
    expect(submitted[0].dni).toBe("12345678");
    expect(submitted[0].celular).toBe(SANDBOX_FROM);
    // IMG-2: the data URI prefix comes from the FAKE downloader's mimeType
    // ("image/png"), NOT the request-declared mediaMimeType ("image/jpeg") —
    // a non-null data URI proves download + encodeImagenField ran.
    expect(submitted[0].imagen?.startsWith("data:image/png;base64,")).toBe(true);
  });
});