import { describe, expect, it } from "vitest";
import type { QuejaPayload } from "../ports/quejas-submission-client.js";
import {
  createSandboxCapturingSender,
  createSandboxMediaDownloader,
  createSandboxQuejasSubmissionClient,
  createSandboxReniecLookupClient,
} from "./sandbox-fakes.js";

describe("createSandboxCapturingSender", () => {
  it("captures sends from a simulated two-pass turn in emission order", async () => {
    const { sender, captures } = createSandboxCapturingSender();
    const to = "51999123456";

    // First re-entry pass of a bounded turn, then the second pass: sendText,
    // sendButtons, sendInteractiveList in this exact order.
    await sender.sendText(to, "Estamos verificando tus datos…");
    await sender.sendButtons(to, {
      body: "¿Cómo deseas continuar?",
      buttons: [{ id: "reclamo_con_dni", title: "Con DNI" }],
    });
    await sender.sendInteractiveList(to, {
      body: "Elige una opción",
      buttonLabel: "Opciones",
      sections: [{ rows: [{ id: "registrar_reclamo", title: "Registrar reclamo" }] }],
    });

    const sent = captures.drain(to);
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual({ kind: "text", to, body: "Estamos verificando tus datos…" });
    expect(sent[1]).toEqual({
      kind: "buttons",
      to,
      buttons: { body: "¿Cómo deseas continuar?", buttons: [{ id: "reclamo_con_dni", title: "Con DNI" }] },
    });
    expect(sent[2]).toEqual({
      kind: "interactive_list",
      to,
      list: {
        body: "Elige una opción",
        buttonLabel: "Opciones",
        sections: [{ rows: [{ id: "registrar_reclamo", title: "Registrar reclamo" }] }],
      },
    });
  });

  it("returns [] on a second drain for the same recipient after the first emptied the buffer", async () => {
    const { sender, captures } = createSandboxCapturingSender();
    await sender.sendText("51999123456", "hola");

    const first = captures.drain("51999123456");
    expect(first).toHaveLength(1);
    expect(first[0]).toEqual({ kind: "text", to: "51999123456", body: "hola" });

    const second = captures.drain("51999123456");
    expect(second).toEqual([]);
  });

  it("keeps another recipient's sends untouched when draining a different from", async () => {
    const { sender, captures } = createSandboxCapturingSender();
    await sender.sendText("51999123456", "para A");
    await sender.sendText("51999123457", "para B");

    const drainedB = captures.drain("51999123457");
    expect(drainedB).toHaveLength(1);
    expect(drainedB[0]).toEqual({ kind: "text", to: "51999123457", body: "para B" });

    const drainedA = captures.drain("51999123456");
    expect(drainedA).toHaveLength(1);
    expect(drainedA[0]).toEqual({ kind: "text", to: "51999123456", body: "para A" });
  });
});

describe("createSandboxReniecLookupClient", () => {
  it("returns found with the default table entry for 12345678", async () => {
    const client = createSandboxReniecLookupClient();

    const result = await client.lookup("12345678");
    expect(result).toEqual({
      status: "found",
      nombres: "JUAN CARLOS",
      apellidoPaterno: "QUISPE",
      apellidoMaterno: "PEREZ",
    });
  });

  it("returns not_found for a DNI missing from the default table", async () => {
    const client = createSandboxReniecLookupClient();

    const result = await client.lookup("11111111");
    expect(result).toEqual({ status: "not_found" });
  });

  it("honors an override table instead of the default", async () => {
    const client = createSandboxReniecLookupClient({
      "87654321": { nombres: "MARIA", apellidoPaterno: "ROJAS", apellidoMaterno: "TORRES" },
    });

    const found = await client.lookup("87654321");
    expect(found).toEqual({
      status: "found",
      nombres: "MARIA",
      apellidoPaterno: "ROJAS",
      apellidoMaterno: "TORRES",
    });

    // The override REPLACES the default table: 12345678 is no longer known.
    const missing = await client.lookup("12345678");
    expect(missing).toEqual({ status: "not_found" });
  });
});

describe("createSandboxQuejasSubmissionClient", () => {
  const payload: QuejaPayload = {
    dni: "12345678",
    nombre_completo: "JUAN CARLOS QUISPE PEREZ",
    celular: "51999123456",
    queja: "Se cayó la pared de mi casa",
    imagen: null,
  };

  it("accepts submissions and echoes the configured reference", async () => {
    const { client, submitted } = createSandboxQuejasSubmissionClient({
      mode: "accepted",
      reference: "DEV-REF-001",
    });

    const result = await client.submit(payload);
    expect(result).toEqual({ status: "accepted", reference: "DEV-REF-001" });
    expect(submitted()).toEqual([payload]);
  });

  it("accepts with a different reference when configured", async () => {
    const { client } = createSandboxQuejasSubmissionClient({
      mode: "accepted",
      reference: "DEV-REF-123",
    });

    const result = await client.submit(payload);
    expect(result).toEqual({ status: "accepted", reference: "DEV-REF-123" });
  });

  it("rejects with the configured reason", async () => {
    const { client } = createSandboxQuejasSubmissionClient({
      mode: "rejected",
      reason: "media_too_large",
    });

    const result = await client.submit(payload);
    expect(result).toEqual({ status: "rejected", reason: "media_too_large" });
  });

  it("rejects with a different configured reason", async () => {
    const { client } = createSandboxQuejasSubmissionClient({
      mode: "rejected",
      reason: "invalid_payload",
    });

    const result = await client.submit(payload);
    expect(result).toEqual({ status: "rejected", reason: "invalid_payload" });
  });

  it("exposes an empty log before any submission", async () => {
    const { submitted } = createSandboxQuejasSubmissionClient({ mode: "accepted" });

    expect(submitted()).toEqual([]);
  });

  it("accumulates every submitted payload in the log in submission order", async () => {
    const { client, submitted } = createSandboxQuejasSubmissionClient({ mode: "accepted" });

    await client.submit(payload);
    await client.submit({ ...payload, dni: "87654321" });

    const log = submitted();
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual(payload);
    expect(log[1].dni).toBe("87654321");
  });
});

describe("createSandboxMediaDownloader", () => {
  it("returns the default synthetic png payload with matching sizeBytes", async () => {
    const downloader = createSandboxMediaDownloader();

    const media = await downloader.download("img_001");
    expect(media.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(media.mimeType).toBe("image/png");
    expect(media.sizeBytes).toBe(media.bytes.length);
    expect(media.sizeBytes).toBe(3);
  });

  it("returns configured bytes with the matching sizeBytes", async () => {
    const downloader = createSandboxMediaDownloader(new Uint8Array([9, 8, 7, 6, 5]));

    const media = await downloader.download("img_002");
    expect(media.bytes).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
    expect(media.mimeType).toBe("image/png");
    expect(media.sizeBytes).toBe(media.bytes.length);
    expect(media.sizeBytes).toBe(5);
  });
});