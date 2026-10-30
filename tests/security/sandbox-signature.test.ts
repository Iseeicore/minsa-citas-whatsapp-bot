import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionRowExists: vi.fn(async () => false),
  resetSession: vi.fn(async () => undefined),
  saveSession: vi.fn(async () => undefined),
  runTurn: vi.fn(async () => ({
    sent: [{ kind: "send_text", text: "respuesta del bot" }],
    session: { state: "main_menu", slots: {}, counters: {} },
  })),
}));

vi.mock("@/lib/fsm/session/session-store", () => ({
  sessionRowExists: mocks.sessionRowExists,
  resetSession: mocks.resetSession,
  saveSession: mocks.saveSession,
}));
vi.mock("@/lib/fsm/core/executor", () => ({ runTurn: mocks.runTurn }));

import { OPTIONS, POST } from "@/app/api/sandbox/route";
import { signSandboxBody, verifySandboxSignature } from "@/lib/security/sandbox-signature";
import { SandboxSignatureResult } from "@/lib/enums/sandbox-signature-result";

const SECRET = "secreto-compartido-de-prueba";
const BODY = JSON.stringify({ from: "sandbox-2e5f8b01-3c4d-4e6f-9a71-8293a4b5c6d7", type: "text", text: "hola" });
const nowSeconds = () => Math.floor(Date.now() / 1000);

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/sandbox", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function signed(body: string, timestamp = String(nowSeconds()), secret = SECRET) {
  return {
    "x-sandbox-timestamp": timestamp,
    "x-sandbox-signature": signSandboxBody(secret, timestamp, body),
  };
}

beforeEach(() => {
  process.env.SANDBOX_ENABLED = "true";
  vi.clearAllMocks();
  mocks.sessionRowExists.mockResolvedValue(false);
});

afterEach(() => {
  delete process.env.SANDBOX_SHARED_SECRET;
  delete process.env.SANDBOX_ENABLED;
});

describe("verifySandboxSignature", () => {
  const timestamp = "1700000000";
  const base = { secret: SECRET, body: BODY, nowSeconds: 1700000000 };

  it("accepts the signature made with the same secret, timestamp and body", () => {
    const signature = signSandboxBody(SECRET, timestamp, BODY);
    expect(verifySandboxSignature({ ...base, timestamp, signature })).toBe(SandboxSignatureResult.VALID);
  });

  it("reports a missing header apart from an invalid one", () => {
    expect(verifySandboxSignature({ ...base, timestamp: null, signature: "x" })).toBe(SandboxSignatureResult.MISSING);
    expect(verifySandboxSignature({ ...base, timestamp, signature: null })).toBe(SandboxSignatureResult.MISSING);
  });

  it("rejects a body changed after signing", () => {
    const signature = signSandboxBody(SECRET, timestamp, BODY);
    expect(verifySandboxSignature({ ...base, timestamp, signature, body: BODY.replace("hola", "adios") })).toBe(
      SandboxSignatureResult.INVALID,
    );
  });

  it("rejects a signature made with another secret", () => {
    const signature = signSandboxBody("otro-secreto", timestamp, BODY);
    expect(verifySandboxSignature({ ...base, timestamp, signature })).toBe(SandboxSignatureResult.INVALID);
  });

  it("rejects garbage of any length without throwing", () => {
    expect(verifySandboxSignature({ ...base, timestamp, signature: "corta" })).toBe(SandboxSignatureResult.INVALID);
    expect(verifySandboxSignature({ ...base, timestamp: "no-es-numero", signature: "x" })).toBe(SandboxSignatureResult.INVALID);
  });

  it("rejects an old or a future timestamp so a copied request cannot be replayed", () => {
    const old = String(1700000000 - 301);
    const future = String(1700000000 + 301);
    expect(verifySandboxSignature({ ...base, timestamp: old, signature: signSandboxBody(SECRET, old, BODY) })).toBe(
      SandboxSignatureResult.EXPIRED,
    );
    expect(verifySandboxSignature({ ...base, timestamp: future, signature: signSandboxBody(SECRET, future, BODY) })).toBe(
      SandboxSignatureResult.EXPIRED,
    );
  });
});

describe("POST /api/sandbox without SANDBOX_SHARED_SECRET (default: nothing changes)", () => {
  it("answers an unsigned request as before", async () => {
    const response = await POST(post(BODY));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/sandbox with SANDBOX_SHARED_SECRET", () => {
  beforeEach(() => {
    process.env.SANDBOX_SHARED_SECRET = SECRET;
  });

  it("answers a correctly signed request", async () => {
    const response = await POST(post(BODY, signed(BODY)));

    expect(response.status).toBe(200);
  });

  it("answers 401 to a request with no signature, like a bare curl, and never runs a turn", async () => {
    const response = await POST(post(BODY));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
    expect(mocks.runTurn).not.toHaveBeenCalled();
    expect(mocks.saveSession).not.toHaveBeenCalled();
    expect(mocks.sessionRowExists).not.toHaveBeenCalled();
  });

  it("answers 401 to a signature made with another secret", async () => {
    const response = await POST(post(BODY, signed(BODY, undefined, "otro-secreto")));

    expect(response.status).toBe(401);
  });

  it("answers 401 to a body changed after signing", async () => {
    const response = await POST(post(BODY.replace("hola", "adios"), signed(BODY)));

    expect(response.status).toBe(401);
  });

  it("answers 401 to an old timestamp", async () => {
    const response = await POST(post(BODY, signed(BODY, String(nowSeconds() - 3600))));

    expect(response.status).toBe(401);
  });

  it("does not leak the secret or the expected signature in the 401 body", async () => {
    const response = await POST(post(BODY));
    const text = await response.text();

    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(signSandboxBody(SECRET, "0", BODY));
  });

  it("answers 404 when the sandbox is disabled, before looking at the signature", async () => {
    process.env.SANDBOX_ENABLED = "false";

    const response = await POST(post(BODY));

    expect(response.status).toBe(404);
  });
});

describe("OPTIONS /api/sandbox", () => {
  const preflight = (origin?: string) =>
    new NextRequest("http://localhost/api/sandbox", { method: "OPTIONS", headers: origin ? { origin } : {} });

  it("answers 404 when the sandbox is disabled, with or without Origin, so it does not reveal the route", async () => {
    process.env.SANDBOX_ENABLED = "false";

    expect((await OPTIONS(preflight())).status).toBe(404);
    expect((await OPTIONS(preflight("https://qminsadigital.minsa.gob.pe"))).status).toBe(404);
  });

  it("answers 404 when SANDBOX_ENABLED is not defined at all", async () => {
    delete process.env.SANDBOX_ENABLED;

    expect((await OPTIONS(preflight())).status).toBe(404);
  });

  it("keeps answering 204 when the sandbox is enabled", async () => {
    expect((await OPTIONS(preflight())).status).toBe(204);
  });
});
