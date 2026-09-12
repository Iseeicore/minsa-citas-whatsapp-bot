import { describe, expect, it } from "vitest";
import { AppError, MalformedPayloadError, QueueUnavailableError } from "./errors.js";

// D9: these types carry NO statusCode field on purpose — they must remain
// usable from the non-HTTP worker process (src/worker.ts), which has no
// concept of an HTTP status code. The HTTP mapping lives exclusively in
// src/error-handler.ts's statusFor().
describe("domain errors", () => {
  it("QueueUnavailableError is an AppError and an Error, with no statusCode field", () => {
    const err = new QueueUnavailableError("dao rejected");

    expect(err).toBeInstanceOf(QueueUnavailableError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("QueueUnavailableError");
    expect(err.message).toBe("dao rejected");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("MalformedPayloadError is an AppError and an Error, with no statusCode field", () => {
    const err = new MalformedPayloadError("bad json");

    expect(err).toBeInstanceOf(MalformedPayloadError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MalformedPayloadError");
    expect(err.message).toBe("bad json");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("preserves the original cause when constructed with { cause }", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new QueueUnavailableError("dao rejected", { cause });

    expect(err.cause).toBe(cause);
  });

  it("QueueUnavailableError and MalformedPayloadError are distinct types — instanceof does not cross-match", () => {
    const queueErr = new QueueUnavailableError("x");
    const payloadErr = new MalformedPayloadError("y");

    expect(queueErr).not.toBeInstanceOf(MalformedPayloadError);
    expect(payloadErr).not.toBeInstanceOf(QueueUnavailableError);
  });
});
