import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger.js";
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